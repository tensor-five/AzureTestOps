import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';
const path = '/phase2/sets/catalog/release-matrix';
function setup() {
    const { services } = matrixTestServices();
    const matrixServices = vi.fn((_context: unknown, _options?: { signal?: AbortSignal }) => services);
    const route = registerReleaseMatrixRoutes({ resolveContext: async () => ({ organization: 'org', project: 'project' }), matrixServices } as unknown as AdoRuntime,
        { getById: async () => ({ planId: '1' }) } as unknown as SetRepositoryPort);
    const res = Object.assign(new EventEmitter(), { writableEnded: false, setHeader: vi.fn(), end: vi.fn(function(this: { writableEnded: boolean }) { this.writableEnded = true; }) });
    return { services, matrixServices, res, route };
}
describe('matrix server read diagnosis', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
    it.each(['b83911a1-1699-4c0e-a87b-903cb5d64c7c', 'sensitive-token-never-log'])('validates client correlation before logging (%s)', async supplied => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        const f = setup();
        await f.route('GET', path, { headers: { 'x-matrix-request-id': supplied } } as unknown as IncomingMessage, f.res as unknown as ServerResponse);
        const id = log.mock.calls[0][1].requestId;
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        if (supplied.startsWith('sensitive')) expect(JSON.stringify(log.mock.calls)).not.toContain(supplied);
        else expect(id).toBe(supplied);
        expect(log.mock.calls.at(-1)?.[1].event).toBe('complete');
        expect(f.res.setHeader).toHaveBeenCalledWith('x-matrix-request-id', id);
        expect(f.res.listenerCount('close')).toBe(0);
    });
    it('ends diagnostics and aborts the read when its browser connection closes', async () => {
        vi.useFakeTimers(); const log = vi.spyOn(console, 'info').mockImplementation(() => {}); const f = setup();
        let resolve!: (value: []) => void;
        vi.spyOn(f.services.testCatalog, 'listSuitesForPlan').mockImplementation(() => new Promise(r => { resolve = r; }));
        const pending = f.route('GET', path, { headers: {} } as IncomingMessage, f.res as unknown as ServerResponse);
        await vi.waitFor(() => expect(f.matrixServices).toHaveBeenCalledOnce());
        f.res.emit('close');
        expect(f.matrixServices.mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(log.mock.calls.at(-1)?.[1].event).toBe('aborted'); expect(vi.getTimerCount()).toBe(0);
        resolve([]); await pending;
        expect(f.res.end).not.toHaveBeenCalled(); expect(f.res.listenerCount('close')).toBe(0);
    });
});
