import type { TestPoint } from './test-point.js';

/** Azure clears both execution references when a point is reset to Ready. */
export function isActiveTestPoint(point: TestPoint | null | undefined): boolean {
  return !!point && (point.pointState === 'Ready' || point.pointState === 'Active')
    && point.lastOutcome === 'Unspecified'
    && !(point.lastRunId !== null && point.lastRunId > 0)
    && !(point.lastResultId !== null && point.lastResultId > 0);
}
