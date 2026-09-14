import { expect, it, vi } from 'vitest';
import { ApiError } from '../../application/dto/api-error.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { resetMatrixPoint } from '../../application/use-cases/reset-matrix-point.use-case.js';
import { resetActiveServices } from '../../../tests/fixtures/reset-active.js';
import { getMatrixMutationRevision, MatrixMutationStore } from './matrix-mutation-store.js';
import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';

const input: MatrixWrite = {contextIdentity: 'context', planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'ResetToActive'};
async function fixture() {
  const fixture = resetActiveServices();
  fixture.active.add(input.pointId);
  const snapshot: MatrixSnapshot = {...await loadReleaseMatrix(1, fixture.services), contextIdentity: input.contextIdentity};
  const projection = snapshot.projections.find(p => p.suiteId === input.suiteId && p.workItemId === input.workItemId)!;
  const port = {load: vi.fn(async () => snapshot), record: vi.fn(async () => ({runId: null, resetToActive: true as const, projection}))};
  const store = new MatrixMutationStore(port, 'set', 1, input.contextIdentity);
  return {snapshot, projection, port, store};
}
it('confirms reset without a run and emits its exact projection to the matching view', async () => {
  const {store, projection} = await fixture();
  const listener = vi.fn(); const unsubscribe = store.subscribeConfirmed(listener);
  const before = getMatrixMutationRevision();
  await store.record(input);
  expect(listener).toHaveBeenCalledExactlyOnceWith(projection);
  expect(store.getSnapshot().status).toBe('Auf Active zurückgesetzt.');
  expect(store.getSnapshot().confirmationRevision).toBeGreaterThan(before);
  unsubscribe(); await store.record(input);
  expect(listener).toHaveBeenCalledTimes(1);
});
it('allows an explicit second attempt after validation failed before any Azure reset', async () => {
  const backend = resetActiveServices();
  const membership = vi.spyOn(backend.services.outcomeRead, 'isCaseInSuite')
    .mockRejectedValueOnce(new Error('TEST_CASES_HTTP_503'));
  const record = vi.fn(() => resetMatrixPoint({ ...input, outcome: 'ResetToActive' }, backend.services));
  const store = new MatrixMutationStore({ load: vi.fn(), record }, 'set', input.planId, input.contextIdentity);
  await store.record(input);
  expect(record).toHaveBeenCalledTimes(1);
  expect(backend.azure.writes).toHaveLength(0);
  expect(store.getSnapshot().blocked.size).toBe(0);
  expect(store.getSnapshot().error).toContain('nicht gestartet');
  // Nothing retries automatically; only this explicit user action starts another attempt.
  await store.record(input);
  expect(record).toHaveBeenCalledTimes(2);
  expect(backend.azure.writes).toHaveLength(1);
  expect(store.getSnapshot().error).toBe('');
  expect(store.getSnapshot().status).toBe('Auf Active zurückgesetzt.');
  membership.mockRestore();
});
it.each([new TypeError('Failed to fetch'), new ApiError(502, 'HTTP_502', 'Gateway lost response')])(
  'locks an ambiguous reset transport failure and recovers from physical evidence: %s', async error => {
    const {store, port, snapshot} = await fixture();
    port.record.mockRejectedValue(error);
    await store.record(input); await store.record(input);
    expect(port.record).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
    expect(store.getSnapshot().error).toContain('Reset auf Active');
    store.reconcile(snapshot, getMatrixMutationRevision());
    expect(store.getSnapshot().blocked.size).toBe(0);
    expect(store.getSnapshot().status).toBe('Auf Active zurückgesetzt.');
    expect(port.record).toHaveBeenCalledTimes(1);
  });
it.each(['fresh', 'old-read', 'no-proof', 'other-point', 'other-suite', 'other-case', 'other-context', 'old-run', 'wrong-error-point'] as const)(
  'unconfirmed reset reconciles only a fresh physical active point: %s', async variant => {
    const {store, snapshot, port} = await fixture();
    const before = getMatrixMutationRevision();
    const confirmed = vi.fn(); store.subscribeConfirmed(confirmed);
    port.record.mockRejectedValue(new ApiError(500, 'MATRIX_RESET_UNCONFIRMED', 'Reset nicht bestätigt', {pointId: variant === 'wrong-error-point' ? 999 : input.pointId}));
    await store.record(input); await store.record(input);
    expect(port.record).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
    if (variant === 'no-proof') delete snapshot.activePoints;
    if (variant === 'other-point') snapshot.activePoints![0].pointId = 999;
    if (variant === 'other-suite') snapshot.activePoints![0].suiteId = 999;
    if (variant === 'other-case') snapshot.activePoints![0].workItemId = 999;
    if (variant === 'other-context') snapshot.contextIdentity = 'other';
    if (variant === 'old-run') snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)!.lastRunId = 100;
    store.reconcile(snapshot, variant === 'old-read' ? before : getMatrixMutationRevision());
    expect(store.getSnapshot().blocked.has('21:201')).toBe(variant !== 'fresh');
    expect(confirmed).toHaveBeenCalledTimes(variant === 'fresh' ? 1 : 0);
    expect(port.record).toHaveBeenCalledTimes(1);
  });
