import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchAzureRestClient, type FetchLike } from './fetch-azure-rest-client.js';
const url = 'https://dev.azure.com/test/project';
const response = () => ({ status: 200, text: async () => '{}', headers: { get: () => null, forEach: () => {} } });
describe('Azure complete transport deadline', () => {
    afterEach(() => vi.useRealTimers());
    it('times out authentication and prevents a late POST even if fetch ignores signals', async () => {
        vi.useFakeTimers();
        let resolve!: (token: { accessToken: string }) => void;
        const bearer = () => new Promise<{ accessToken: string }>(r => { resolve = r; });
        const fetchImpl = vi.fn<FetchLike>(async () => response());
        const client = new FetchAzureRestClient({ bearer, fetchImpl, timeoutMs: 100 });
        const rejected = expect(client.post(url, {})).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(100); await rejected;
        resolve({ accessToken: 'never-log-this-secret' }); await Promise.resolve(); await Promise.resolve();
        expect(fetchImpl).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    });
    it.each(['fetch', 'body'] as const)('aborts an unresponsive %s phase and clears its timer', async phase => {
        vi.useFakeTimers(); let signal: AbortSignal | undefined;
        const fetchImpl: FetchLike = async (_, init) => {
            signal = init?.signal;
            if (phase === 'fetch') return new Promise(() => {});
            return { ...response(), text: () => new Promise(() => {}) };
        };
        const rejected = expect(new FetchAzureRestClient({ fetchImpl, timeoutMs: 100 }).get(url)).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(100); await rejected;
        expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    });
    it('rejects an already aborted signal without starting auth or leaving timers', async () => {
        vi.useFakeTimers(); const controller = new AbortController(); controller.abort();
        const bearer = vi.fn(async () => ({ accessToken: 'secret' }));
        const fetchImpl = vi.fn<FetchLike>(async () => response());
        await expect(new FetchAzureRestClient({ bearer, fetchImpl }).get(url, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(bearer).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    });
    it('forwards cancellation and removes listeners on success and failure', async () => {
        vi.useFakeTimers(); const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const client = new FetchAzureRestClient({ fetchImpl: async () => response() });
        await client.get(url, { signal: controller.signal });
        expect(remove).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
        const rejected = expect(new FetchAzureRestClient({ fetchImpl: () => new Promise(() => {}) }).get(url, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort(); await rejected;
        expect(remove).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    });
});
