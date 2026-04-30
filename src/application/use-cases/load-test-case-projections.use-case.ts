import { aggregateTestCaseProjections } from "../../domain/test-management/outcome-aggregator.js";
import {
  flattenSuiteTree,
  type TestSuiteNode
} from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseHydrationData } from "../../domain/test-management/test-case-hydration-data.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestPoint } from "../../domain/test-management/test-point.js";
import type { TestResult } from "../../domain/test-management/test-result.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { TestManagementReadPort } from "../ports/test-management.port.js";
import type { WorkItemHydrationPort } from "../ports/work-item-hydration.port.js";
import { mapConcurrent } from "../../shared/utils/concurrency.js";

export type LoadTestCaseProjectionsInput = {
  planId: number;
  rootSuiteId: number;
};

export type LoadTestCaseProjectionsResult = {
  suiteTree: TestSuiteNode;
  projections: TestCaseProjection[];
};

export type LoadTestCaseProjectionsDeps = {
  testManagement: TestManagementReadPort;
  workItemHydration: WorkItemHydrationPort;
  /** Concurrency for per-suite and per-run fan-outs. Defaults to 8. */
  concurrency?: number;
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
  const suiteTree = await deps.testManagement.loadSuiteTree(input.planId, input.rootSuiteId);
  const suiteEntries = flattenSuiteTree(suiteTree);

  const perSuite = await mapConcurrent(suiteEntries, concurrency, async (entry) => {
    const [caseIds, points] = await Promise.all([
      deps.testManagement.listTestCasesInSuite(input.planId, entry.id),
      deps.testManagement.loadPointsForSuite(input.planId, entry.id)
    ]);
    return { suiteId: entry.id, caseIds, points };
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

  const [runs, workItemsById] = await Promise.all([
    deps.testManagement.listRunsForPlan(input.planId),
    deps.workItemHydration.hydrateWorkItems([...allWorkItemIds])
  ]);

  const resultsByRun = await mapConcurrent(runs, concurrency, async (run) =>
    deps.testManagement.loadResultsForRun(run.runId)
  );

  const allResults: TestResult[] = ([] as TestResult[]).concat(...resultsByRun);

  const projections = aggregateTestCaseProjections({
    suiteEntries,
    testCasesBySuiteId,
    pointsBySuiteId,
    results: allResults,
    hydrationByWorkItemId: projectHydration(workItemsById)
  });

  return { suiteTree, projections };
}

function projectHydration(
  workItemsById: Map<number, WorkItem>
): Map<number, TestCaseHydrationData> {
  const projected = new Map<number, TestCaseHydrationData>();
  for (const [id, item] of workItemsById) {
    projected.set(id, {
      title: item.title,
      state: item.state,
      workItemType: item.workItemType,
      assignedTo: item.assignedTo,
      tags: item.tags,
      areaPath: item.areaPath,
      priority: item.priority,
      relatedIds: item.relatedIds
    });
  }
  return projected;
}
