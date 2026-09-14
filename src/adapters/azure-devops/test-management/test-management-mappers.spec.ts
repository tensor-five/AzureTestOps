import { describe, expect, it } from 'vitest';
import { readNumber, toTestPoint, toTestResult, toTestRun } from './test-management-mappers.js';
describe('shared Azure test mappings', () => {
  it('preserves explicit result completion and never infers it when absent', () => {
    const raw = { id: 5, testRun: { id: 10 }, testCase: { id: 201 }, outcome: 'Passed' };
    expect(toTestResult(raw)).not.toHaveProperty('state');
    expect(toTestResult({ ...raw, state: 'Completed' })).toMatchObject({ state: 'Completed' });
  });
  it('only supplies a missing run plan when its caller has a filtered plan scope', () => {
    expect(toTestRun({ id: '10', state: 'Completed' })).toBeNull();
    expect(toTestRun({ id: '10', state: 'Completed' }, 1)).toMatchObject({ runId: 10, planId: 1 });
    expect(toTestRun({ id: '10', plan: { id: '2' } }, 1)?.planId).toBe(2);
  });
  it('preserves cleared execution references and reset state from a point', () => {
    expect(toTestPoint({ id: '21', testCase: { id: '201' }, state: 'Ready', outcome: 'Unspecified',
      lastTestRun: { id: '0' }, lastResult: { id: '0' } }, 5)).toMatchObject({ pointId: 21, workItemId: 201,
      suiteId: 5, pointState: 'Ready', lastOutcome: 'Unspecified', lastRunId: 0, lastResultId: 0 });
  });
  it('prefers work-item ID over an unrelated internal test-case reference', () => {
    expect(toTestResult({ id: 5, testRun: { id: 10 }, testCase: { id: 201 }, testCaseReferenceId: 999,
      testPoint: { id: 21 }, outcome: 'Passed' })).toMatchObject({ workItemId: 201, suiteId: null, pointId: 21 });
  });
  it.each([undefined, null, '', ' ', 'unknown', Infinity])('does not infer numeric identity from %s', value => {
    expect(readNumber(value)).toBeNull();
  });
});
