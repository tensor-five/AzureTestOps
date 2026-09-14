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
};

export type LoadTestCaseProjectionsDeps = {
  testManagement: TestManagementReadPort;
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
  deps.signal?.throwIfAborted();
  const suiteTree = await deps.testManagement.loadSuiteTree(input.planId, input.rootSuiteId);
  const suiteEntries = flattenSuiteTree(suiteTree).filter(suite => !input.includedSuiteIds || input.includedSuiteIds.has(suite.id));

  const perSuite = await mapConcurrent(suiteEntries, concurrency, async (entry) => {
    const [caseIds, points] = await settleOutcomeReads([
      deps.testManagement.listTestCasesInSuite(input.planId, entry.id),
      deps.testManagement.loadPointsForSuite(input.planId, entry.id)
    ] as const);
    return { suiteId: entry.id, caseIds, points };
  }, deps.signal);

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
    loadPlanTestResults(input.planId, allWorkItemIds.size > 0, deps),
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

  return { suiteTree, projections, ...execution, pointsBySuiteId, testCasesBySuiteId };
}
