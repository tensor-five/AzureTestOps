import { loadPlanTestResults } from './load-plan-test-results.js';
import { settleOutcomeReads } from './matrix-outcome-target.js';
import type { TestRun } from '../../domain/test-management/test-run.js';
import { aggregateTestCaseProjections } from "../../domain/test-management/outcome-aggregator.js";
import {
  flattenSuiteTree,
  type TestSuiteNode
} from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestPoint } from "../../domain/test-management/test-point.js";
import type { TestResult } from "../../domain/test-management/test-result.js";
import type { TestCaseHydrationPort } from "../ports/test-case-hydration.port.js";
import type { TestManagementReadPort } from "../ports/test-management.port.js";
import { mapConcurrent } from "../../shared/utils/concurrency.js";
import type { PlanTestResults, TestResultHistoryPort } from '../ports/test-result-history.port.js';
import type { DataFreshness } from '../dto/data-freshness.dto.js';
import { combineDataFreshness } from '../services/data-freshness.js';

export type LoadTestCaseProjectionsInput = {
  planId: number;
  rootSuiteId: number;
  includedSuiteIds?: ReadonlySet<number>;
};

export type LoadTestCaseProjectionsResult = {
  suiteTree: TestSuiteNode;
  projections: TestCaseProjection[];
  runs: TestRun[];
  results: TestResult[];
  pointsBySuiteId: Map<number, TestPoint[]>;
  testCasesBySuiteId: Map<number, number[]>;
  freshness: DataFreshness;
};

export type LoadTestCaseProjectionsDeps = {
  testManagement: TestManagementReadPort;
  testResultHistory?: TestResultHistoryPort;
  testCaseHydration: TestCaseHydrationPort;
  /** Concurrency for per-suite and per-run fan-outs. Defaults to 8. */
  concurrency?: number;
  signal?: AbortSignal;
};

const DEFAULT_CONCURRENCY = 8;

/**
 * Orchestrates the full snapshot load for a single Set:
 *   suite-tree → (test cases per suite, points per suite) → runs → results
 *   → hydrate work items → aggregate (workItemId, suiteId) projections.
 *
 * All fan-outs go through `mapConcurrent` with a bounded worker pool so we
 * stay well under the Azure DevOps rate limit even for large plans.
 */
export async function loadTestCaseProjections(
  input: LoadTestCaseProjectionsInput,
  deps: LoadTestCaseProjectionsDeps
): Promise<LoadTestCaseProjectionsResult> {
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const startedAt = new Date().toISOString();
  deps.signal?.throwIfAborted();
  const suiteTree = await deps.testManagement.loadSuiteTree(input.planId, input.rootSuiteId);
  const suiteEntries = flattenSuiteTree(suiteTree).filter(suite => !input.includedSuiteIds || input.includedSuiteIds.has(suite.id));

  const historyController = new AbortController();
  const historySignal = deps.signal ? AbortSignal.any([deps.signal, historyController.signal]) : historyController.signal;
  let history: Promise<PromiseSettledResult<PlanTestResults>> | undefined;
  const startHistory = () => {
    // Observe rejection immediately: a fast history failure may precede slow suite/point reads.
    history ??= loadPlanTestResults(input.planId, true, { ...deps, signal: historySignal }).then(
      value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
  };
  const perSuite = await mapConcurrent(suiteEntries, concurrency, async (entry) => {
    const [caseIds, points] = await settleOutcomeReads([
      deps.testManagement.listTestCasesInSuite(input.planId, entry.id).then(ids => {
        if (ids.length > 0) startHistory();
        return ids;
      }),
      deps.testManagement.loadPointsForSuite(input.planId, entry.id)
    ] as const);
    return { suiteId: entry.id, caseIds, points };
  }, deps.signal).catch(async error => {
    historyController.abort();
    await history;
    throw error;
  });

  const testCasesBySuiteId = new Map<number, number[]>();
  const pointsBySuiteId = new Map<number, TestPoint[]>();
  const allWorkItemIds = new Set<number>();

  for (const entry of perSuite) {
    testCasesBySuiteId.set(entry.suiteId, entry.caseIds);
    pointsBySuiteId.set(entry.suiteId, entry.points);
    for (const id of entry.caseIds) {
      allWorkItemIds.add(id);
    }
  }

  const [execution, hydrationByWorkItemId] = await settleOutcomeReads([
    history ? history.then(result => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    }) : loadPlanTestResults(input.planId, false, deps),
    deps.testCaseHydration.hydrateTestCases([...allWorkItemIds])
  ] as const);
  deps.signal?.throwIfAborted();
  const projections = aggregateTestCaseProjections({
    suiteEntries,
    testCasesBySuiteId,
    pointsBySuiteId,
    results: execution.results,
    hydrationByWorkItemId
  });

  return { suiteTree, projections, ...execution, freshness: combineDataFreshness(startedAt, [execution.freshness]), pointsBySuiteId, testCasesBySuiteId };
}
