import { createMatrixReadDiagnostics } from '../diagnostics/matrix-read-diagnostics.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { AzureTestManagementAdapter } from '../../adapters/azure-devops/test-management/azure-test-management.adapter.js';
import { describe, expect, it, vi } from 'vitest';
import { createMatrixReadHttpClient } from './matrix-read-http-client.js';
const url = 'https://dev.azure.com/org/project/_apis/test/Plans/1/suites?asTree=true';
describe('matrix request HTTP sharing', () => {
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
});
