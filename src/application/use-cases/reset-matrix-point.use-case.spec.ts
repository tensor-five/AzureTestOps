import { describe, expect, it } from 'vitest';
import { resetActiveServices } from '../../../tests/fixtures/reset-active.js';
import { resetMatrixPoint } from './reset-matrix-point.use-case.js';
import { recordMatrixOutcome } from './record-matrix-outcome.use-case.js';
import { loadReleaseMatrix } from './load-release-matrix.use-case.js';
import type { MatrixResetTarget } from '../dto/release-matrix.dto.js';
import type { MatrixWriteDiagnostics } from './record-matrix-outcome-diagnostics.js';

const target: MatrixResetTarget = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'ResetToActive' };
describe('reset a physical matrix test point', () => {
  it('confirms Active over historical Failed results and leaves the same case in other suites unchanged', async () => {
    const { services, azure } = resetActiveServices();
    const historical = structuredClone(azure.results);
    const confirmed = await resetMatrixPoint(target, services);
    expect(confirmed).toMatchObject({ runId: null, resetToActive: true, projection: { lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, testPointId: 21201 } });
    expect(azure.writes).toHaveLength(1);
    expect(azure.writes[0].body).toEqual({ resetToActive: true });
    expect(azure.results).toEqual(historical);
    expect(azure.runs).toHaveLength(1);
    const snapshot = await loadReleaseMatrix(1, services);
    expect(snapshot.activePoints).toEqual([{ pointId: 21201, suiteId: 21, workItemId: 201 }]);
    expect(snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastOutcome).toBe('Unspecified');
    expect(snapshot.projections.find(p => p.suiteId === 22 && p.workItemId === 201)?.lastOutcome).toBe('Passed');
  });
  it('shows a new execution normally after a reset', async () => {
    const { services } = resetActiveServices();
    await resetMatrixPoint(target, services);
    const result = await recordMatrixOutcome({ ...target, outcome: 'Failed' }, services);
    expect(result.projection).toMatchObject({ lastOutcome: 'Failed', lastRunId: 100, lastResultId: 1000 });
    expect((await loadReleaseMatrix(1, services)).activePoints).toEqual([]);
  });
  it('preserves a failed second configuration when the first configuration is active', async () => {
    const { services, azure, active } = resetActiveServices();
    // Case 302 already has two physical points in suite 23 in this fixture.
    active.add(23302);
    azure.results.push({ id: 900, testRun: { id: 1 }, testSuite: { id: 23 }, testCase: { id: 302 },
      testPoint: { id: 123302 }, outcome: 'Failed', state: 'Completed', completedDate: '2026-09-14T12:00:00Z' });
    const snapshot = await loadReleaseMatrix(1, services);
    expect(snapshot.pointCounts['23:302']).toBe(2);
    expect(snapshot.projections.find(p => p.suiteId === 23 && p.workItemId === 302))
      .toMatchObject({ lastOutcome: 'Failed', lastRunId: 1, lastResultId: 900 });
  });
  it.each([
    { ...target, pointId: 999 }, { ...target, workItemId: 999 },
    { ...target, suiteId: 23, workItemId: 302, pointId: 23302 }, { ...target, planId: 0 },
  ])('rejects invalid or ambiguous targets before any write: %j', async input => {
    const { services, azure } = resetActiveServices();
    await expect(resetMatrixPoint(input, services)).rejects.toMatchObject({ code: 'MATRIX_RESET_NOT_ATTEMPTED' });
    expect(azure.writes).toEqual([]);
  });
  it.each([false, true])('returns a structured uncertainty and never repeats a failed reset (stale read: %s)', async staleRead => {
    const { services, azure, control } = resetActiveServices();
    control.staleRead = staleRead;
    control.resetStatus = staleRead ? 200 : 400;
    const entries: Parameters<MatrixWriteDiagnostics['event']>[0][] = [];
    await expect(resetMatrixPoint(target, { ...services, diagnostics: { event: entry => entries.push(entry) } }))
      .rejects.toMatchObject({ code: 'MATRIX_RESET_UNCONFIRMED', details: { pointId: 21201 } });
    expect(azure.writes).toHaveLength(1);
    expect(entries.at(-1)).toMatchObject({ stage: staleRead ? 'confirm-active-point' : 'reset-point', event: 'error', fields: {
      pointId: 21201, outcome: 'ResetToActive', ...(staleRead ? { pointMatches: false } : { httpStatus: 400 }),
    } });
  });
});
