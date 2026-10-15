import { createMatrixReadDiagnostics } from '../diagnostics/matrix-read-diagnostics.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { AzureTestManagementAdapter } from '../../adapters/azure-devops/test-management/azure-test-management.adapter.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixReadHttpClient } from './matrix-read-http-client.js';
const url = 'https://dev.azure.com/org/project/_apis/test/Plans/1/suites?asTree=true';
describe('matrix request HTTP sharing', () => {
    afterEach(() => vi.useRealTimers());
    it('separates HTTP resource timings, shared reads and observed retry waiting', async () => {
        vi.useFakeTimers();
        const sink = vi.fn(), diagnostics = createMatrixReadDiagnostics('read', 'server', sink);
        const client = { get: vi.fn().mockResolvedValueOnce({ status: 429, json: {}, headers: { 'retry-after': '2' } }).mockResolvedValue({ status: 200, json: {} }) };
        const read = createMatrixReadHttpClient(client, { diagnostics });
        const resultUrl = 'https://dev.azure.com/private-org/private-project/_apis/test/Runs/42/results?$top=100';
        await read.get(resultUrl);
        await vi.advanceTimersByTimeAsync(2000);
        await Promise.all([read.get(resultUrl), read.get(resultUrl)]);
        await read.get('https://dev.azure.com/private-org/private-project/_apis/wit/wiql/private-query');
        diagnostics.finish('complete');
        expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ counts: { httpStarted: 3, httpCompleted: 3, httpStatus429: 1,
            httpStatus200: 2, httpRetries: 1, httpRetryWaitMs: 2000, httpCacheHits: 1, httpMaxInFlight: 1 },
            operations: { 'http.results': { calls: 2 }, 'http.query': { calls: 1 } } });
        expect(JSON.stringify(sink.mock.calls)).not.toContain('private-');
    });
    it('fetches the full plan tree once even when subtree roots are requested child first', async () => {
        const { azure } = matrixTestServices();
        const get = vi.spyOn(azure.client, 'get');
        const adapter = new AzureTestManagementAdapter(createMatrixReadHttpClient(azure.client, {}), { organization: 'contract-org', project: 'contract-project' });
        const child = await adapter.loadSuiteTree(1, 43);
        const parent = await adapter.loadSuiteTree(1, 1);
        expect(child.id).toBe(43); expect(parent.id).toBe(1);
        expect(get).toHaveBeenCalledTimes(1);
    });
    it('reports throttling with numeric retry delay while redacting unrelated headers and bodies', async () => {
        const sink = vi.fn(); const diagnostics = createMatrixReadDiagnostics('request-id', 'server', sink);
        const client = { get: vi.fn(async () => ({ status: 429, json: { secret: 'body-secret' }, headers: { 'retry-after': '120', authorization: 'header-secret' } })) };
        await createMatrixReadHttpClient(client, { diagnostics }).get(url);
        diagnostics.finish('error');
        expect(sink.mock.calls.some(([entry]) => entry.event === 'http-response' && entry.status === 429 && entry.retryAfterMs === 120000)).toBe(true);
        expect(JSON.stringify(sink.mock.calls)).not.toContain('secret');
    });
    it('shares the same full tree URL across subtree loads only within this request', async () => {
        const client = { get: vi.fn(async () => ({ status: 200, json: {} })) };
        const first = createMatrixReadHttpClient(client, {});
        await Promise.all([first.get(url), first.get(url)]);
        expect(client.get).toHaveBeenCalledTimes(1);
        await createMatrixReadHttpClient(client, {}).get(url);
        expect(client.get).toHaveBeenCalledTimes(2);
    });
    it('evicts failed responses and rejected transports so existing retries still work', async () => {
        const client = { get: vi.fn().mockResolvedValueOnce({ status: 429, json: {} }).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ status: 200, json: {} }) };
        const read = createMatrixReadHttpClient(client, {});
        await read.get(url); await expect(read.get(url)).rejects.toThrow('network'); await read.get(url);
        expect(client.get).toHaveBeenCalledTimes(3);
    });
    it('passes cancellation through and stops further reads', async () => {
        const controller = new AbortController(); const client = { get: vi.fn(async () => ({ status: 200, json: {} })) };
        const read = createMatrixReadHttpClient(client, { signal: controller.signal });
        await read.get(url); expect(client.get).toHaveBeenCalledWith(url, { signal: controller.signal });
        controller.abort(); expect(() => read.get(url)).toThrow();
    });
    it('combines request and call cancellation while keeping distinct consumer transports independent', async () => {
        const request = new AbortController(), first = new AbortController(), second = new AbortController();
        const transports: Array<{ signal: AbortSignal; resolve(value: { status: number; json: object }): void }> = [];
        const client = { get: vi.fn((_url: string, options?: { signal?: AbortSignal }) => new Promise<{status: number; json: object}>((resolve, reject) => {
            const signal = options!.signal!;
            transports.push({ signal, resolve });
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })) };
        const read = createMatrixReadHttpClient(client, { signal: request.signal });
        const cancelled = read.get(url, { signal: first.signal }).catch(error => error);
        const independent = read.get(url, { signal: second.signal });
        expect(client.get).toHaveBeenCalledTimes(2);
        first.abort();
        expect(await cancelled).toMatchObject({ name: 'AbortError' });
        expect(transports[1].signal.aborted).toBe(false);
        transports[1].resolve({ status: 200, json: {} });
        await expect(independent).resolves.toMatchObject({ status: 200 });
        second.abort();
        expect(() => read.get(url, { signal: second.signal })).toThrow();
        expect(request.signal.aborted).toBe(false);
        const third = new AbortController();
        const interrupted = read.get(url, { signal: third.signal }).catch(error => error);
        request.abort();
        expect(await interrupted).toMatchObject({ name: 'AbortError' });
        expect(third.signal.aborted).toBe(false);
    });
});
