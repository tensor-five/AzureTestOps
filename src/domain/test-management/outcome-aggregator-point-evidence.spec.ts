import { describe, expect, it } from 'vitest';
import { aggregateTestCaseProjections, type OutcomeAggregatorInput } from './outcome-aggregator.js';
import type { TestResult } from './test-result.js';

function fixture() {
  const previous: TestResult = { resultId: 50, runId: 5, suiteId: 21, workItemId: 201, pointId: 21201,
    outcome: 'Failed', completedDate: '2026-09-01T10:00:00Z', state: 'Completed' };
  const current: TestResult = { ...previous, resultId: 1000, runId: 100, suiteId: null,
    outcome: 'Passed', completedDate: '2026-09-14T10:00:00Z' };
  const point = { pointId: 21201, suiteId: 21, workItemId: 201, configurationId: 1, configurationName: 'Default',
    lastRunId: 100, lastResultId: 1000, lastOutcome: 'Passed' };
  const input: OutcomeAggregatorInput = {
    suiteEntries: [{ id: 21, parentSuiteId: null, path: 'Release > TST > Regression', name: 'Regression', depth: 0 }],
    testCasesBySuiteId: new Map([[21, [201]]]), pointsBySuiteId: new Map([[21, [point]]]), results: [previous, current],
    hydrationByWorkItemId: new Map([[201, { title: 'Import', state: 'Ready', workItemType: 'Test Case', tags: [],
      assignedTo: null, areaPath: null, priority: null, relatedIds: [] }]]),
  };
  return { previous, current, point, input };
}
describe('exact point result evidence in a full read', () => {
  it('keeps a newer confirmed point result visible when Azure omitted its suite', () => {
    const { input } = fixture();
    expect(aggregateTestCaseProjections(input)[0]).toMatchObject({ lastOutcome: 'Passed', lastRunId: 100,
      lastResultId: 1000, lastResultCompletedDate: null });
  });
  it.each<Partial<TestResult>>([
    { workItemId: 999 }, { pointId: 999 }, { suiteId: 22 }, { runId: 999 }, { resultId: 999 }, { outcome: 'Blocked' },
    { state: undefined }, { state: 'InProgress' }, { completedDate: null }, { completedDate: 'invalid' },
    { completedDate: '2026-09-01T10:00:00Z' }, { completedDate: '2026-08-01T10:00:00Z' },
  ])('does not override history with missing or contradictory evidence: %j', patch => {
    const { input, current } = fixture();
    Object.assign(current, patch);
    expect(aggregateTestCaseProjections(input)[0]).toMatchObject({ lastOutcome: 'Failed', lastRunId: 5, lastResultId: 50 });
  });
  it.each([false, true])('does not grant precedence to duplicate raw identities (contradictory: %s)', contradictory => {
    const { input, current } = fixture();
    input.results.push({ ...current, ...(contradictory ? { outcome: 'Blocked' } : {}) });
    expect(aggregateTestCaseProjections(input)[0].lastOutcome).toBe('Failed');
  });
  it('does not hide results from another configuration', () => {
    const { input, point } = fixture();
    input.pointsBySuiteId.get(21)!.push({ ...point, pointId: 21202, configurationId: 2 });
    expect(aggregateTestCaseProjections(input)[0].lastOutcome).toBe('Failed');
  });
  it('requires the point itself to reference the exact existing execution', () => {
    const { input, point } = fixture();
    point.lastResultId = 999;
    expect(aggregateTestCaseProjections(input)[0].lastOutcome).toBe('Failed');
  });
  it('keeps explicit reset precedence over every historical result', () => {
    const { input, point } = fixture();
    Object.assign(point, { pointState: 'Ready', lastOutcome: 'Unspecified', lastRunId: 0, lastResultId: 0 });
    expect(aggregateTestCaseProjections(input)[0]).toMatchObject({ lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null });
  });
  it('does not copy an outcome to the same case in another suite', () => {
    const { input, point, previous } = fixture();
    input.suiteEntries.push({ id: 22, parentSuiteId: null, path: 'Release > ACC > Regression', name: 'Regression', depth: 0 });
    input.testCasesBySuiteId.set(22, [201]);
    input.pointsBySuiteId.set(22, [{ ...point, pointId: 22201, suiteId: 22, lastRunId: 5, lastResultId: 51, lastOutcome: 'Blocked' }]);
    input.results.push({ ...previous, resultId: 51, suiteId: 22, pointId: 22201, outcome: 'Blocked' });
    expect(aggregateTestCaseProjections(input).map(p => p.lastOutcome)).toEqual(['Passed', 'Blocked']);
  });
});
