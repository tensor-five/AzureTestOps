import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';

/** Patch execution fields only; suite membership and relation data keep their identity. */
export function applyConfirmedOutcomes(projections: TestCaseProjection[], updates: readonly TestCaseProjection[]): TestCaseProjection[] {
  return projections.map(projection => {
    const update = updates.find(value => value.suiteId === projection.suiteId
      && value.workItemId === projection.workItemId && value.testPointId === projection.testPointId);
    return update ? { ...projection, lastOutcome: update.lastOutcome, lastRunId: update.lastRunId,
      lastResultId: update.lastResultId, lastResultCompletedDate: update.lastResultCompletedDate } : projection;
  });
}
