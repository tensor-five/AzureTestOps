import { parseRetryAfterMilliseconds } from '../utils/retry.js';
import type { AzureHttpResponse, AzureRestHttpClient } from './azure-rest-client.js';
import type { MatrixReadDiagnostics } from '../diagnostics/matrix-read-diagnostics.js';
/** GET-only cache for one matrix load. Failed responses are evicted so existing retry policy still applies. */
export function createMatrixReadHttpClient(client: AzureRestHttpClient, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics }): AzureRestHttpClient {
    const pending = new Map<string, Promise<AzureHttpResponse>>();
    return { signal: options.signal, get(url) {
        options.signal?.throwIfAborted();
        const cached = pending.get(url);
        if (cached) return cached;
        const work = () => client.get(url, { signal: options.signal });
        const parsed = new URL(url);
        const suite = parsed.pathname.match(/\/suites\/(\d+)/i), run = parsed.pathname.match(/\/runs\/(\d+)/i);
        const ids = { ...(suite ? { suiteId: Number(suite[1]) } : {}), ...(run ? { runId: Number(run[1]) } : {}) };
        const request = (options.diagnostics ? options.diagnostics.measure('http', ids, work) : work()).then(response => {
            options.diagnostics?.httpResponse(response.status, ids, parseRetryAfterMilliseconds(response.headers?.['retry-after']));
            if (response.status < 200 || response.status >= 300) pending.delete(url);
            return response;
        }, error => { pending.delete(url); throw error; });
        pending.set(url, request);
        return request;
    } };
}
