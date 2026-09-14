import { describe, expect, it, vi } from 'vitest';
import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult } from '../../application/dto/release-matrix.dto.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { getMatrixMutationRevision, getMatrixMutationStore } from './matrix-mutation-store.js';

const contextIdentity = 'https://dev.azure.com/contract-org/contract-project';
const input: MatrixWrite = { contextIdentity, planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Passed' };

async function fixture() {
    const { services } = matrixTestServices();
    const snapshot: MatrixSnapshot = { ...await loadReleaseMatrix(1, services), contextIdentity };
    const result: MatrixWriteResult = { runId: 100, projection: {
        ...snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)!, lastOutcome: 'Passed', lastRunId: 100,
    } };
    const port = { load: vi.fn(async () => snapshot), record: vi.fn(async () => result) };
    return { snapshot, result, port, store: getMatrixMutationStore(port, 'catalog', 1, contextIdentity) };
}

describe('Matrix mutation lifetime and scope', () => {
    it('retains the pending lock without listeners and prevents another invocation after returning to the same set', async () => {
        const { port, store, result } = await fixture();
        let finish!: (value: MatrixWriteResult) => void;
        port.record.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const started = store.record(input);
        expect(store.getSnapshot().pending.has('21:201')).toBe(true);
        const remounted = getMatrixMutationStore(port, 'catalog', 1, contextIdentity);
        expect(remounted).toBe(store);
        await remounted.record(input);
        expect(port.record).toHaveBeenCalledTimes(1);
        finish(result);
        await started;
        expect(remounted.getSnapshot().pending.size).toBe(0);
        expect(remounted.getSnapshot().status).toContain('100');
    });

    it('retains a failed created run and isolates its message from other sets, plans, contexts and clients', async () => {
        const { port, store } = await fixture();
        port.record.mockRejectedValue(new Error('Durchlauf 100 wurde angelegt, Ergebnis nicht bestätigt.'));
        await store.record(input);
        expect(store.getSnapshot().error).toContain('100');
        expect(getMatrixMutationStore(port, 'other', 1, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'catalog', 2, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'catalog', 1, 'other-project').getSnapshot().error).toBe('');
        expect(getMatrixMutationStore({ ...port }, 'catalog', 1, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'catalog', 1, contextIdentity).getSnapshot().error).toContain('nicht bestätigt');
    });

    it('records a completion revision without keeping an outcome cache that could override newer reads', async () => {
        const { store } = await fixture();
        const before = getMatrixMutationRevision();
        await store.record(input);
        expect(store.getSnapshot().confirmationRevision).toBeGreaterThan(before);
        expect(store.getSnapshot().confirmationRevision).toBe(getMatrixMutationRevision());
        expect(store.getSnapshot()).not.toHaveProperty('projections');
    });

    it('does not erase a failed run when a different cell is recorded', async () => {
        const { port, store } = await fixture();
        port.record.mockRejectedValueOnce(new Error('Durchlauf 100 ist nicht bestätigt.'));
        await store.record(input);
        await store.record({ ...input, suiteId: 22, pointId: 22201 });
        expect(store.getSnapshot().error).toContain('100 ist nicht bestätigt');
    });
});
