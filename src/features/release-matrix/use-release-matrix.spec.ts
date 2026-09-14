// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult } from '../../application/dto/release-matrix.dto.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { useReleaseMatrix } from './use-release-matrix.js';
import { matrixPreferenceStore } from './matrix-preference-store.js';
import { ApiError } from '../../application/dto/api-error.js';

vi.mock('./matrix-preference-store.js', () => ({ matrixPreferenceStore: { load: () => null, save: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const contextIdentity = 'https://dev.azure.com/contract-org/contract-project';
const input: MatrixWrite = { contextIdentity, planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Passed' };

async function fixture() {
    const { services } = matrixTestServices();
    const snapshot: MatrixSnapshot = { ...await loadReleaseMatrix(1, services), contextIdentity };
    const confirmed = { runId: 100, projection: {
        ...snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)!, lastOutcome: 'Passed', lastRunId: 100,
    } };
    let resolve!: (result: MatrixWriteResult) => void;
    let reject!: (error: Error) => void;
    let liveSnapshot = snapshot;
    const port = { load: vi.fn(async () => liveSnapshot), record: vi.fn(() => new Promise<MatrixWriteResult>((yes, no) => { resolve = yes; reject = no; })) };
    const mount = async (setId = 'catalog') => {
        const hook = renderHook(() => useReleaseMatrix(setId, 1, 10, port, contextIdentity));
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        return hook;
    };
    return { port, snapshot, confirmed, mount, resolve: () => {
        liveSnapshot = { ...snapshot, projections: snapshot.projections.map(p => p.suiteId === 21 && p.workItemId === 201 ? confirmed.projection : p) };
        resolve(confirmed);
    }, reject: () => reject(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Durchlauf 100 wurde angelegt, Ergebnis nicht bestätigt.',{runId:100})) };
}

describe('Release matrix navigation during writes', () => {
    it('releases an unconfirmed run only after successful reload confirms that point, including after remount',async()=>{
        const f=await fixture(),first=await f.mount();let write!:Promise<void>;
        act(()=>{write=first.result.current.record(input);});await act(async()=>{f.reject();await write;});
        expect(first.result.current.blocked.has('21:201')).toBe(true);
        f.port.load.mockRejectedValueOnce(new Error('Read failed'));
        await act(()=>first.result.current.reload());expect(first.result.current.blocked.has('21:201')).toBe(true);
        const partial={...f.snapshot,projections:[{...f.confirmed.projection,lastResultCompletedDate:null}]};
        f.port.load.mockResolvedValueOnce(partial);
        await act(()=>first.result.current.reload());expect(first.result.current.blocked.has('21:201')).toBe(true);
        f.port.load.mockResolvedValueOnce({...f.snapshot,completedRunIds:[1],projections:[f.confirmed.projection]});
        await act(()=>first.result.current.reload());expect(first.result.current.blocked.has('21:201')).toBe(true);
        first.unmount();f.port.load.mockResolvedValue({...f.snapshot,completedRunIds:[100],
            resultEvidence:[{resultId:1000,runId:100,suiteId:null,workItemId:201,pointId:21201,outcome:'Passed',completedDate:'2026-09-02T10:00:00Z'}],
            projections:[{...f.confirmed.projection,lastResultCompletedDate:null}]});
        const returned=await f.mount();
        expect(returned.result.current.blocked.size).toBe(0);
        expect(returned.result.current.error).toBe('');expect(returned.result.current.status).toContain('100');
        expect(returned.result.current.snapshot?.projections[0].lastRunId).toBe(100);
        expect(f.port.record).toHaveBeenCalledTimes(1);expect(matrixPreferenceStore.save).not.toHaveBeenCalled();
    });
    it.each(['success', 'failure'] as const)('does not replace a foreground read after confirmation (%s)', async outcome => {
        const f = await fixture(), hook = await f.mount();
        let write!: Promise<void>, foreground!: Promise<void>;
        act(() => { write = hook.result.current.record(input); });
        let finish!: (snapshot: MatrixSnapshot) => void, fail!: (error: Error) => void;
        f.port.load.mockImplementationOnce(() => new Promise((yes, no) => { finish = yes; fail = no; }));
        act(() => { foreground = hook.result.current.reload(); });
        await act(async () => { f.resolve(); await write; });
        expect(hook.result.current.loading).toBe(true);
        expect(f.port.load).toHaveBeenCalledTimes(2);
        await act(async () => {
            if (outcome === 'success') finish(f.snapshot); else fail(new Error('Read nicht erreichbar.'));
            await foreground;
        });
        expect(hook.result.current.loading).toBe(false);
        expect(f.port.load).toHaveBeenCalledTimes(2);
        if (outcome === 'success') expect(hook.result.current.snapshot?.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastRunId).toBe(100);
        else expect(hook.result.current.error).toContain('Read nicht erreichbar');
    });

    it('restores a pending cell lock and a later failure after navigating away and returning', async () => {
        const f = await fixture();
        const first = await f.mount();
        let write!: Promise<void>;
        act(() => { write = first.result.current.record(input); });
        first.unmount();
        const other = await f.mount('other');
        expect(other.result.current.pending.size).toBe(0);
        expect(other.result.current.error).toBe('');
        other.unmount();
        const returned = await f.mount();
        expect(returned.result.current.pending.has('21:201')).toBe(true);
        await act(() => returned.result.current.record(input));
        expect(f.port.record).toHaveBeenCalledTimes(1);
        returned.unmount();
        await act(async () => { f.reject(); await write; });
        const failed = await f.mount();
        expect(failed.result.current.error).toContain('100 wurde angelegt, Ergebnis nicht bestätigt');
        expect(failed.result.current.pending.size).toBe(0);
        await act(() => failed.result.current.reload());
        expect(failed.result.current.error).toContain('nicht bestätigt');
        expect(matrixPreferenceStore.save).not.toHaveBeenCalled();
    });

    it('keeps confirmation feedback after unmount without displaying it in another set or context', async () => {
        const f = await fixture();
        const first = await f.mount();
        let write!: Promise<void>;
        act(() => { write = first.result.current.record(input); });
        first.unmount();
        await act(async () => { f.resolve(); await write; });
        const other = await f.mount('other');
        expect(other.result.current.status).toBe('');
        other.unmount();
        const returned = await f.mount();
        expect(returned.result.current.status).toBe('Durchlauf bestätigt: 100');
        returned.unmount();
        f.port.load.mockResolvedValue({ ...f.snapshot, contextIdentity: 'other-project' });
        const changedContext = await f.mount();
        expect(changedContext.result.current.status).toBe('');
    });

    it('shows an unconfirmed run in its set and context even when the next initial matrix read also fails', async () => {
        const f = await fixture();
        const first = await f.mount();
        let write!: Promise<void>;
        act(() => { write = first.result.current.record(input); });
        first.unmount();
        await act(async () => { f.reject(); await write; });
        f.port.load.mockRejectedValue(new Error('Azure ist nicht erreichbar.'));
        const returned = await f.mount();
        expect(returned.result.current.snapshot).toBeNull();
        expect(returned.result.current.error).toContain('100 wurde angelegt, Ergebnis nicht bestätigt');
        expect(returned.result.current.error).toContain(contextIdentity);
        returned.unmount();
        const other = await f.mount('other');
        expect(other.result.current.error).not.toContain('100');
        expect(other.result.current.error).toContain('Azure ist nicht erreichbar');
    });

    it('updates the mounted cell but preserves newer server results on subsequent refreshes', async () => {
        const f = await fixture();
        const hook = await f.mount();
        let write!: Promise<void>;
        act(() => { write = hook.result.current.record(input); });
        await act(async () => { f.resolve(); await write; });
        expect(hook.result.current.snapshot?.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastOutcome).toBe('Passed');
        f.port.load.mockResolvedValue({ ...f.snapshot, projections: [{ ...f.confirmed.projection, lastRunId: 101, lastOutcome: 'Blocked' }] });
        await act(() => hook.result.current.reload());
        expect(hook.result.current.snapshot?.projections[0].lastOutcome).toBe('Blocked');
    });

    it('patches without reloading and keeps the table locked after an explicit refresh failure', async () => {
        const f = await fixture();
        const hook = await f.mount();
        let failRead!: (error: Error) => void;
        f.port.load.mockImplementationOnce(() => new Promise((_resolve, reject) => { failRead = reject; }));
        let write!: Promise<void>;
        act(() => { write = hook.result.current.record(input); });
        await act(async () => { f.resolve(); await write; });
        expect(hook.result.current.loading).toBe(false);
        expect(hook.result.current.snapshot?.projections.length).toBeGreaterThan(0);
        expect(hook.result.current.status).toContain('100');
        expect(f.port.load).toHaveBeenCalledTimes(1);
        let refresh!: Promise<void>;
        act(() => { refresh = hook.result.current.reload(true); });
        await act(async () => { failRead(new Error('Azure ist nicht erreichbar.')); await refresh; });
        expect(hook.result.current.snapshot?.projections.length).toBeGreaterThan(0);
        expect(hook.result.current.error).toContain('Matrix konnte nicht geladen werden');
        expect(hook.result.current.error).toContain('veraltet');
        expect(hook.result.current.stale).toBe(true);
        expect(hook.result.current.status).toContain('100');
        await act(() => hook.result.current.record({ ...input, outcome: 'Blocked' }));
        expect(f.port.record).toHaveBeenCalledTimes(1);
        await act(() => hook.result.current.reload());
        expect(hook.result.current.stale).toBe(false);
        expect(hook.result.current.snapshot?.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastOutcome).toBe('Passed');
    });

    it('does not clear stale state or start another read when a second point is confirmed', async () => {
        const f = await fixture();
        const hook = await f.mount();
        let finishFirst!: (value: MatrixWriteResult) => void;
        let finishSecond!: (value: MatrixWriteResult) => void;
        f.port.record.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
        let finishRead!: (snapshot: MatrixSnapshot) => void;
        f.port.load.mockRejectedValueOnce(new Error('Erster Read fehlgeschlagen.'))
            .mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
        let first!: Promise<void>;
        let second!: Promise<void>;
        act(() => {
            first = hook.result.current.record(input);
            second = hook.result.current.record({ ...input, suiteId: 22, pointId: 22201 });
        });
        await act(async () => { finishFirst(f.confirmed); await first; });
        await act(() => hook.result.current.reload(true));
        expect(hook.result.current.stale).toBe(true);
        const other = { runId: 101, projection: { ...f.snapshot.projections.find(p => p.suiteId === 22 && p.workItemId === 201)!, lastRunId: 101, lastOutcome: 'Passed' } };
        await act(async () => { finishSecond(other); await second; });
        expect(hook.result.current.stale).toBe(true);
        await act(() => hook.result.current.record({ ...input, outcome: 'Blocked' }));
        expect(f.port.record).toHaveBeenCalledTimes(2);
        expect(f.port.load).toHaveBeenCalledTimes(2);
        let refresh!: Promise<void>;
        act(() => { refresh = hook.result.current.reload(true); });
        await act(async () => { finishRead({ ...f.snapshot, projections: [f.confirmed.projection, other.projection] }); await refresh; });
        expect(hook.result.current.stale).toBe(false);
    });

    it('applies confirmation when a returning view started reading before the pending write finished', async () => {
        const f = await fixture();
        const first = await f.mount();
        let write!: Promise<void>;
        act(() => { write = first.result.current.record(input); });
        first.unmount();
        let finishRead!: (snapshot: MatrixSnapshot) => void;
        f.port.load.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
        const returned = renderHook(() => useReleaseMatrix('catalog', 1, 10, f.port));
        await act(async () => { f.resolve(); await write; finishRead(f.snapshot); });
        await waitFor(() => expect(returned.result.current.loading).toBe(false));
        expect(returned.result.current.snapshot?.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastRunId).toBe(100);
        expect(f.port.load).toHaveBeenCalledTimes(2);
    });
});
