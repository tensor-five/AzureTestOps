import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { buildRuntime } from '../../composition/runtime.js';
import { registerActiveSetSnapshotStreamRoute } from './active-set-snapshot-route.js';

const requestId = 'b83911a1-1699-4c0e-a87b-903cb5d64c7c';
const streamPath = '/phase2/active-set/snapshot/stream';

describe('relations read diagnosis through real runtime and Azure adapters', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

    async function harness() {
        const directory = await mkdtemp(path.join(tmpdir(), 'snapshot-diagnostics-'));
        const { azure } = matrixTestServices();
        const original = azure.client.get.bind(azure.client);
        azure.client.get = async url => url.includes('/wit/wiql/')
            ? { status: 200, json: { workItems: [{ id: 101 }] } } : original(url);
        const runtime = buildRuntime({ userPreferencesFilePath: path.join(directory, 'preferences.json'), httpClient: azure.client });
        await runtime.adoContext.setContext({ organization: 'private-org', project: 'private-project' });
        const set = await runtime.setRepository.create({ name: 'private-set', planId: '1', rootSuiteId: '20', queryId: 'private-query' });
        const res = Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false, statusCode: 0,
            setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn(function(this: { writableEnded: boolean }) { this.writableEnded = true; }) });
        const route = registerActiveSetSnapshotStreamRoute(runtime);
        return { azure, runtime, res,
            run: (id = requestId) => route('GET', streamPath, new URL(`http://local${streamPath}?setId=${set.id}&requestId=${encodeURIComponent(id)}`), {} as IncomingMessage, res as unknown as ServerResponse),
            cleanup: () => rm(directory, { recursive: true, force: true }) };
    }

    it('correlates one complete summary with HTTP counts, phase timings and data counts', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {}), f = await harness();
        try {
            await f.run();
            const entries = log.mock.calls.filter(call => call[0] === '[relations.read]').map(call => JSON.parse(call[1]));
            expect(entries.every(entry => entry.requestId === requestId && entry.side === 'server')).toBe(true);
            expect(entries.filter(entry => ['complete', 'error', 'aborted'].includes(entry.event))).toHaveLength(1);
            expect(entries.at(-1)).toMatchObject({ event: 'complete', activeCount: 0,
                counts: { queryWorkItemCount: 1, runsItems: 1, resultsItems: 5, httpStatus200: expect.any(Number) },
                operations: { 'http.query': { calls: 1 }, 'http.results': { calls: 1 },
                    'phase.test-cases': { completed: 1 }, 'phase.saved-query': { completed: 1 },
                    query: { completed: 1 }, 'work-items': { completed: 1 } } });
            expect(entries.at(-1).counts.httpStarted).toBe(entries.at(-1).counts.httpStatus200);
            expect(f.res.setHeader).toHaveBeenCalledWith('x-view-request-id', requestId);
            expect(f.res.write.mock.calls.some(([value]) => value === 'event: result\n')).toBe(true);
            expect(f.res.listenerCount('close')).toBe(0);
            expect(JSON.stringify(entries)).not.toContain('private-');
            expect(f.azure.writes).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    it('redacts rejected correlation values and records read failures once', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {}), f = await harness();
        f.azure.control.failRead = true;
        try {
            await f.run('private-token');
            const entries = log.mock.calls.filter(call => call[0] === '[relations.read]').map(call => JSON.parse(call[1]));
            expect(entries[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
            expect(entries.filter(entry => entry.event === 'error')).toHaveLength(1);
            expect(entries.at(-1)).toMatchObject({ event: 'error', activeCount: 0, counts: { httpStatus400: expect.any(Number) } });
            expect(f.res.write.mock.calls.some(([value]) => value === 'event: error\n')).toBe(true);
            expect(JSON.stringify(entries)).not.toContain('private-');
        } finally { await f.cleanup(); }
    });

    it('terminates logging immediately on a closed stream and clears the periodic timer', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {}), f = await harness();
        let resolve!: (value: { organization: string; project: string }) => void;
        f.runtime.ado.resolveContext = () => new Promise(result => { resolve = result; });
        vi.useFakeTimers();
        try {
            const pending = f.run();
            await vi.advanceTimersByTimeAsync(10_000);
            f.res.destroyed = true;
            f.res.emit('close');
            const count = log.mock.calls.length;
            resolve({ organization: 'private-org', project: 'private-project' });
            await pending;
            await vi.advanceTimersByTimeAsync(30_000);
            expect(log).toHaveBeenCalledTimes(count);
            expect(JSON.parse(log.mock.calls.at(-1)?.[1]).event).toBe('aborted');
            expect(vi.getTimerCount()).toBe(0);
            expect(f.res.end).not.toHaveBeenCalled();
            expect(f.res.listenerCount('close')).toBe(0);
        } finally { vi.useRealTimers(); await f.cleanup(); }
    });
});
