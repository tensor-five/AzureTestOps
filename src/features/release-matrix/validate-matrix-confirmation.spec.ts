import { expect, it, vi } from 'vitest';
import type { MatrixActionResult, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import { validateMatrixConfirmation } from './validate-matrix-confirmation.js';
import { MatrixMutationStore } from './matrix-mutation-store.js';
const input: MatrixWrite = {planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, contextIdentity: 'context', outcome: 'Passed'};
const valid = {runId: 100, projection: {suiteId: 21, workItemId: 201, testPointId: 21201, lastRunId: 100,
  lastResultId: 1000, lastOutcome: 'Passed', lastResultCompletedDate: null}};
it('accepts a confirmed outcome, including missing suite date fallback, and an exact active reset', () => {
  expect(() => validateMatrixConfirmation(valid, input)).not.toThrow();
  expect(() => validateMatrixConfirmation({...valid, runId: null, resetToActive: true, projection: {...valid.projection,
    lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null}}, {...input, outcome: 'ResetToActive'})).not.toThrow();
});
it.each([{}, null, 'HTML', {...valid, runId: 101}, ...[
  {suiteId: 22}, {workItemId: 202}, {testPointId: 22201}, {lastRunId: 101}, {lastOutcome: 'Failed'},
  {lastResultId: 0}, {lastResultCompletedDate: 'invalid'}, {lastResultCompletedDate: undefined},
].map(patch => ({...valid, projection: {...valid.projection, ...patch}}))])('rejects a malformed or unrelated confirmation without poisoning the journal: %j', async value => {
  const port = {load: vi.fn(), record: vi.fn(async () => value as MatrixActionResult)};
  const store = new MatrixMutationStore(port, 'set', 1, input.contextIdentity), listener = vi.fn();
  store.subscribeConfirmed(listener);
  await store.record(input); await store.record(input);
  expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
  expect(store.getSnapshot().status).toBe('');
  expect(store.getSnapshot().confirmationRevision).toBe(0);
  expect(listener).not.toHaveBeenCalled();
  expect(port.record).toHaveBeenCalledTimes(1);
});
it('does not accept an ordinary run response for a reset', () => {
  expect(() => validateMatrixConfirmation(valid, {...input, outcome: 'ResetToActive'})).toThrow();
});
