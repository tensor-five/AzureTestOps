import type { TestSuiteFlatEntry } from "./test-suite-tree.js";
import type { TestPoint } from "./test-point.js";
import type { TestResult } from "./test-result.js";
import type { TestCaseHydrationData } from "./test-case-hydration-data.js";
import {
  projectionKey,
  type TestCaseProjection,
  type TestCaseProjectionKey
} from "./test-case-projection.js";
import { NOT_RUN } from "./outcome.js";
import { isActiveTestPoint } from './active-test-point.js';

export type OutcomeAggregatorInput = {
  /** Flat suite entries inside the active set (root + descendants). */
  suiteEntries: TestSuiteFlatEntry[];
  /** Work item ids that belong to each suite, keyed by suiteId. */
  testCasesBySuiteId: Map<number, number[]>;
  /** Test points loaded per suite, keyed by suiteId. */
  pointsBySuiteId: Map<number, TestPoint[]>;
  /** Flat list of test results across all runs of the active plan. */
  results: TestResult[];
  /** Hydrated test-case work-item data keyed by id (Test Case work items only). */
  hydrationByWorkItemId: Map<number, TestCaseHydrationData>;
};

/**
 * Pure aggregation: builds one TestCaseProjection per (workItemId, suiteId)
 * combination, joining the latest matching test result by `completedDate`.
 *
 * Test Cases without a hydrated work item are dropped (hydration failure).
 * Results without `completedDate` or `suiteId` are ignored — they cannot be
 * matched into a (workItemId, suiteId) key reliably.
 */
export function aggregateTestCaseProjections(
  input: OutcomeAggregatorInput
): TestCaseProjection[] {
  const latestResultByKey = buildLatestResultIndex(input.results);
  const projections: TestCaseProjection[] = [];

  for (const suite of input.suiteEntries) {
    const caseIds = input.testCasesBySuiteId.get(suite.id) ?? [];
    const pointsByWorkItemId = indexPointsByWorkItem(
      input.pointsBySuiteId.get(suite.id) ?? []
    );

    for (const workItemId of caseIds) {
      const hydration = input.hydrationByWorkItemId.get(workItemId);
      if (!hydration) {
        continue;
      }

      const pointEntry = pointsByWorkItemId.get(workItemId);
      const point = pointEntry?.first ?? null;
      // A reset must not hide another configuration's result for the same case.
      const active = pointEntry?.count === 1 && isActiveTestPoint(point);
      const latestResult = active ? null : latestResultByKey.get(projectionKey(workItemId, suite.id)) ?? null;

      // Fallback to point.lastOutcome — Azure sometimes drops `testSuite.id` on results.
      const fallbackOutcome = point?.lastOutcome ?? NOT_RUN;

      projections.push({
        workItemId,
        suiteId: suite.id,
        suitePath: suite.path,
        title: hydration.title,
        state: hydration.state,
        workItemType: hydration.workItemType,
        assignedTo: hydration.assignedTo,
        tags: hydration.tags,
        areaPath: hydration.areaPath,
        priority: hydration.priority,
        relatedIds: hydration.relatedIds,
        testPointId: point?.pointId ?? null,
        configurationId: point?.configurationId ?? null,
        configurationName: point?.configurationName ?? null,
        lastOutcome: latestResult ? latestResult.outcome : fallbackOutcome,
        lastResultId: active ? null : latestResult?.resultId ?? point?.lastResultId ?? null,
        lastResultCompletedDate: latestResult?.completedDate ?? null,
        lastRunId: active ? null : latestResult?.runId ?? point?.lastRunId ?? null
      });
    }
  }

  return projections;
}

function buildLatestResultIndex(
  results: TestResult[]
): Map<TestCaseProjectionKey, TestResult> {
  const latest = new Map<TestCaseProjectionKey, TestResult>();

  for (const result of results) {
    if (result.completedDate === null || result.suiteId === null) {
      continue;
    }
    const ts = Date.parse(result.completedDate);
    if (Number.isNaN(ts)) {
      continue;
    }
    const key = projectionKey(result.workItemId, result.suiteId);
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, result);
      continue;
    }
    // Date.parse, not string compare — ADO mixes `…Z` and `….123Z` ISO forms.
    const existingTs = existing.completedDate === null ? -Infinity : Date.parse(existing.completedDate);
    if (Number.isNaN(existingTs) || existingTs < ts) {
      latest.set(key, result);
    }
  }

  return latest;
}

function indexPointsByWorkItem(points: TestPoint[]): Map<number, { first: TestPoint; count: number }> {
  const byWorkItem = new Map<number, { first: TestPoint; count: number }>();
  for (const point of points) {
    const entry = byWorkItem.get(point.workItemId);
    if (entry) entry.count++;
    else byWorkItem.set(point.workItemId, { first: point, count: 1 });
  }
  return byWorkItem;
}
