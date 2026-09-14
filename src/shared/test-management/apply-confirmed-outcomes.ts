import type { TestCaseOutcomeUpdate } from '../../domain/test-management/test-case-outcome-update.js';
import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';

/** Patch execution fields only; suite membership and relation data keep their identity. */
export function applyConfirmedOutcomes(projections: TestCaseProjection[], updates: readonly TestCaseOutcomeUpdate[]): TestCaseProjection[] {
  const key = (value: TestCaseOutcomeUpdate) => `${value.suiteId}:${value.workItemId}:${value.testPointId}`;
  const indexed = new Map(updates.map(value => [key(value), value]));
  return projections.map(projection => {
    const update = indexed.get(key(projection));
    return update ? { ...projection, lastOutcome: update.lastOutcome, lastRunId: update.lastRunId,
      lastResultId: update.lastResultId, lastResultCompletedDate: update.lastResultCompletedDate } : projection;
  });
}
