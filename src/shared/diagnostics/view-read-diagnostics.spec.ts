import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewReadDiagnostics, isViewReadRequestId } from './view-read-diagnostics.js';

describe('view read timing summaries', () => {
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('distinguishes wall time from summed parallel operation durations', async () => {
        vi.useFakeTimers();
        const sink = vi.fn(), log = createViewReadDiagnostics('relations', 'read', 'server', sink);
        log.phase('test-cases', false);
        const work = (delay: number) => log.measure('results', { runId: delay }, () => new Promise<number[]>(resolve => setTimeout(() => resolve([1, 2]), delay)));
        const pending = Promise.all([work(100), work(200)]);
        await vi.advanceTimersByTimeAsync(200);
        await pending;
        log.phase('test-cases', true);
        log.finish('complete');
        expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ event: 'complete', elapsedMs: 200, activeCount: 0,
            counts: { resultsStarted: 2, resultsCompleted: 2, resultsItems: 4 }, operations: {
                results: { calls: 2, completed: 2, failed: 0, totalMs: 300, maxMs: 200 },
                'phase.test-cases': { calls: 1, completed: 1, totalMs: 200, maxMs: 200 }
            } });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('includes failed operation duration without logging the exception or result data', async () => {
        vi.useFakeTimers();
        const sink = vi.fn(), log = createViewReadDiagnostics('relations', 'read', 'server', sink);
        await expect(log.measure('query', {}, async () => { vi.advanceTimersByTime(50); throw new Error('private-query-and-token'); })).rejects.toThrow();
        log.finish('error');
        expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ operations: { query: { calls: 1, completed: 0, failed: 1, totalMs: 50 } } });
        expect(JSON.stringify(sink.mock.calls)).not.toContain('private-query-and-token');
    });

    it('does not change reads when logging throws and stops pending logs after termination', async () => {
        vi.useFakeTimers();
        const sink = vi.fn(() => { throw new Error('console unavailable'); });
        const log = createViewReadDiagnostics('relations', 'read', 'browser', sink);
        expect(await log.measure('hydrate', {}, async () => new Map([[1, 'private-title']]))).toEqual(new Map([[1, 'private-title']]));
        await vi.advanceTimersByTimeAsync(10_000);
        log.finish('aborted');
        const count = sink.mock.calls.length;
        log.finish('error');
        await vi.advanceTimersByTimeAsync(30_000);
        expect(sink).toHaveBeenCalledTimes(count);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('writes complete single-line JSON on the server', async () => {
        const sink = vi.spyOn(console, 'info').mockImplementation(() => {});
        const log = createViewReadDiagnostics('relations', 'read', 'server');
        await log.measure('results', { runId: 7 }, async () => []);
        log.finish('complete');
        expect(sink.mock.calls.at(-1)?.[0]).toBe('[relations.read]');
        expect(JSON.parse(sink.mock.calls.at(-1)?.[1])).toMatchObject({ event: 'complete', operations: { results: { calls: 1 } } });
        expect(sink.mock.calls.at(-1)?.[1]).not.toContain('\n');
    });

    it.each([null, undefined, ['b83911a1-1699-4c0e-a87b-903cb5d64c7c'], 'token', 'b83911a1-1699-1c0e-a87b-903cb5d64c7c'])('rejects untrusted correlation values: %s', value => {
        expect(isViewReadRequestId(value)).toBe(false);
    });
    it('accepts UUID-v4 correlation', () => expect(isViewReadRequestId('b83911a1-1699-4c0e-a87b-903cb5d64c7c')).toBe(true));
});
