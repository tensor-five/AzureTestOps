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
 * A missing result suite is only bridged by a unique point's exact execution
 * references with explicit Completed evidence, never by a case-only match.
 */
export function aggregateTestCaseProjections(
  input: OutcomeAggregatorInput
): TestCaseProjection[] {
  const latestResultByKey = buildLatestResultIndex(input.results);
  const uniqueResultsByIdentity = indexUniqueResultIdentities(input.results);
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
      const suiteResult = latestResultByKey.get(projectionKey(workItemId, suite.id)) ?? null;
      const pointResult = !active && pointEntry?.count === 1 && point
        ? newerReferencedResult(point, suite.id, workItemId, suiteResult, uniqueResultsByIdentity) : null;
      const latestResult = active ? null : pointResult ?? suiteResult;

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
        lastResultCompletedDate: latestResult?.suiteId === null ? null : latestResult?.completedDate ?? null,
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

/** Duplicate identities cannot prove which payload the physical point refers to. */
function indexUniqueResultIdentities(results: TestResult[]): Map<string, TestResult | null> {
  const index = new Map<string, TestResult | null>();
  for (const result of results) {
    const key = `${result.runId}:${result.resultId}`;
    index.set(key, index.has(key) ? null : result);
  }
  return index;
}

function newerReferencedResult(point: TestPoint, suiteId: number, workItemId: number, previous: TestResult | null,
  results: ReadonlyMap<string, TestResult | null>): TestResult | null {
  if (point.suiteId !== suiteId || point.workItemId !== workItemId
    || !Number.isSafeInteger(point.lastRunId) || !Number.isSafeInteger(point.lastResultId)
    || (point.lastRunId ?? 0) <= 0 || (point.lastResultId ?? 0) <= 0) return null;
  const result = results.get(`${point.lastRunId}:${point.lastResultId}`);
  if (!result || result.state !== 'Completed' || result.workItemId !== workItemId || result.pointId !== point.pointId
    || (result.suiteId !== null && result.suiteId !== suiteId) || result.outcome !== point.lastOutcome
    || result.completedDate === null) return null;
  const timestamp = Date.parse(result.completedDate);
  const previousTimestamp = previous?.completedDate ? Date.parse(previous.completedDate) : -Infinity;
  return Number.isFinite(timestamp) && timestamp > previousTimestamp ? result : null;
}
