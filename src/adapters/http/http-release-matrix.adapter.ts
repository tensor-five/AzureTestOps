import { createMatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { MatrixSnapshot, MatrixWrite, MatrixActionResult, MatrixSuiteMembership, MatrixTagCatalog } from '../../application/dto/release-matrix.dto.js';
import { jsonFetch } from './json-fetch.js';
export class HttpReleaseMatrixAdapter implements ReleaseMatrixClientPort {
    async loadCached(setId: string, signal?: AbortSignal, versionSuiteIds?: readonly number[], flatVersionSuiteIds?: readonly number[]): Promise<MatrixSnapshot | null> {
        const query = this.selectionQuery(versionSuiteIds, flatVersionSuiteIds);
        query.set('cache', 'only');
        const snapshot = await jsonFetch<MatrixSnapshot | null>(`${this.path(setId)}?${query}`, { method: 'GET', signal });
        // jsonFetch preserves its historical empty-object fallback for a JSON null response.
        return snapshot && Number.isSafeInteger(snapshot.planId) && Array.isArray(snapshot.suites)
            && Array.isArray(snapshot.projections) && typeof snapshot.contextIdentity === 'string' ? snapshot : null;
    }
    async load(setId: string, signal?: AbortSignal, versionSuiteIds?: readonly number[], flatVersionSuiteIds?: readonly number[]): Promise<MatrixSnapshot> {
        const requestId = crypto.randomUUID();
        const diagnostics = createMatrixReadDiagnostics(requestId, 'browser');
        try {
            const query = this.selectionQuery(versionSuiteIds, flatVersionSuiteIds);
            const snapshot = await diagnostics.measure('response', {}, () => jsonFetch<MatrixSnapshot>(this.path(setId) + (query.size ? `?${query}` : ''), { method: 'GET', signal, headers: { 'x-matrix-request-id': requestId } }));
            diagnostics.progress({ planId: snapshot.planId, suiteCount: snapshot.suites.length, projectionCount: snapshot.projections.length });
            diagnostics.finish('complete');
            return snapshot;
        } catch (error) { diagnostics.finish(signal?.aborted ? 'aborted' : 'error'); throw error; }
    }
    async record(setId: string, input: MatrixWrite): Promise<MatrixActionResult> {
        const requestId = crypto.randomUUID(), started = performance.now();
        let event = 'error';
        try {
            const result = await jsonFetch<MatrixActionResult>(this.path(setId) + '/outcomes', {
                method: 'POST', body: input, headers: { 'x-matrix-request-id': requestId },
            });
            event = 'confirmed';
            return result;
        } finally {
            try { console.info('[release-matrix.write-summary]', { requestId, side: 'browser', event,
                elapsedMs: Math.round(performance.now() - started) }); } catch { /* Diagnostic failures never cause a retry. */ }
        }
    }
    private path(setId: string): string { return `/phase2/sets/${encodeURIComponent(setId)}/release-matrix`; }
    private selectionQuery(versionSuiteIds?: readonly number[], flatVersionSuiteIds?: readonly number[]): URLSearchParams {
        const query = new URLSearchParams();
        if (versionSuiteIds) query.set('versions', JSON.stringify(versionSuiteIds));
        if (flatVersionSuiteIds?.length) query.set('flatVersions', JSON.stringify(flatVersionSuiteIds));
        return query;
    }
    loadMembership(setId: string, suiteId: number, contextIdentity: string, signal?: AbortSignal): Promise<MatrixSuiteMembership> {
        return jsonFetch(`${this.path(setId)}/memberships/${suiteId}?contextIdentity=${encodeURIComponent(contextIdentity)}`, { method: 'GET', signal });
    }
    loadTagCatalog(setId: string, contextIdentity: string, signal?: AbortSignal): Promise<MatrixTagCatalog> {
        return jsonFetch(`${this.path(setId)}/tags?contextIdentity=${encodeURIComponent(contextIdentity)}`, { method: 'GET', signal });
    }
}
