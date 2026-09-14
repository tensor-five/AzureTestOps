import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixReadDiagnostics } from './matrix-read-diagnostics.js';
describe('safe matrix read diagnostics', () => {
    afterEach(() => vi.useRealTimers());
    it('summarizes pending operations periodically without logging every read or payload', async () => {
        vi.useFakeTimers(); const sink = vi.fn(); const log = createMatrixReadDiagnostics('read-id', 'server', sink);
        await Promise.all(Array.from({ length: 1000 }, () => log.measure('results', { runId: 7 }, async () => ({ secret: 'never-log' }))));
        let resolve!: () => void;
        const pending = log.measure('points', { suiteId: 10521729 }, () => new Promise<void>(r => { resolve = r; }));
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sink).toHaveBeenCalledTimes(2);
        expect(sink.mock.calls[1][0]).toMatchObject({ requestId: 'read-id', event: 'pending', activeCount: 1, active: [{ operation: 'points', suiteId: 10521729, elapsedMs: 10000 }] });
        resolve(); await pending; log.finish('complete'); log.finish('error');
        expect(sink).toHaveBeenCalledTimes(3); expect(JSON.stringify(sink.mock.calls)).not.toContain('never-log'); expect(vi.getTimerCount()).toBe(0);
    });
    it('redacts exception messages and releases the pending timer on failure', async () => {
        vi.useFakeTimers(); const sink = vi.fn(); const log = createMatrixReadDiagnostics('id', 'browser', sink);
        await expect(log.measure('load', {}, async () => { throw new Error('auth=secret'); })).rejects.toThrow();
        log.finish('error'); expect(JSON.stringify(sink.mock.calls)).not.toContain('secret'); expect(vi.getTimerCount()).toBe(0);
    });
});
