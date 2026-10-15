import { parseRetryAfterMilliseconds } from '../utils/retry.js';
import type { AzureHttpResponse, AzureRestHttpClient } from './azure-rest-client.js';
import type { MatrixReadDiagnostics } from '../diagnostics/matrix-read-diagnostics.js';
/** GET-only cache for one matrix load. Failed responses are evicted so existing retry policy still applies. */
export function createMatrixReadHttpClient(client: AzureRestHttpClient, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics }): AzureRestHttpClient {
    const pending = new Map<string, Promise<AzureHttpResponse>>();
    const failedAt = new Map<string, number>();
    return { signal: options.signal, get(url) {
        options.signal?.throwIfAborted();
        const cached = pending.get(url);
        if (cached) { options.diagnostics?.addCount('httpCacheHits'); return cached; }
        const work = () => client.get(url, { signal: options.signal });
        const parsed = new URL(url);
        const suite = parsed.pathname.match(/\/suites\/(\d+)/i), run = parsed.pathname.match(/\/runs\/(\d+)/i);
        const ids = { ...(suite ? { suiteId: Number(suite[1]) } : {}), ...(run ? { runId: Number(run[1]) } : {}) };
        const previousFailure = failedAt.get(url);
        if (previousFailure !== undefined) options.diagnostics?.httpRetry(ids, Date.now() - previousFailure);
        failedAt.delete(url);
        const resource = /\/results$/i.test(parsed.pathname) ? 'results' : /\/points$/i.test(parsed.pathname) ? 'points'
            : /\/testcases$/i.test(parsed.pathname) ? 'cases' : /\/runs$/i.test(parsed.pathname) ? 'runs'
            : /\/suites$/i.test(parsed.pathname) ? 'suites' : /\/workitems$/i.test(parsed.pathname) ? 'hydrate'
            : /\/wiql\//i.test(parsed.pathname) ? 'query' : 'other';
        const request = (options.diagnostics ? options.diagnostics.measure('http', ids, work, `http.${resource}`) : work()).then(response => {
            options.diagnostics?.httpResponse(response.status, ids, parseRetryAfterMilliseconds(response.headers?.['retry-after']));
            if (response.status < 200 || response.status >= 300) { pending.delete(url); failedAt.set(url, Date.now()); }
            return response;
        }, error => { pending.delete(url); failedAt.set(url, Date.now()); throw error; });
        pending.set(url, request);
        return request;
    } };
}
