import { describe, expect, it } from 'vitest';
import { isActiveTestPoint } from './active-test-point.js';
import type { TestPoint } from './test-point.js';

const point: TestPoint = { pointId: 1, suiteId: 2, workItemId: 3, configurationId: null, configurationName: null,
  pointState: 'Ready', lastOutcome: 'Unspecified', lastRunId: 0, lastResultId: 0 };
describe('explicit active test point evidence', () => {
  it.each(['Ready', 'Active'])('accepts %s and cleared references', pointState => {
    expect(isActiveTestPoint({ ...point, pointState })).toBe(true);
    expect(isActiveTestPoint({ ...point, pointState, lastRunId: null, lastResultId: null })).toBe(true);
  });
  it.each([undefined, null, { ...point, pointState: undefined }, { ...point, lastRunId: 10 },
    { ...point, lastResultId: 5 }, { ...point, lastOutcome: 'Failed' }, { ...point, pointState: 'Completed' }])
    ('does not suppress history without clear active evidence: %j', candidate => {
      expect(isActiveTestPoint(candidate)).toBe(false);
    });
});
