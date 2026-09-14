import { createMatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { MatrixSnapshot, MatrixWrite, MatrixActionResult } from '../../application/dto/release-matrix.dto.js';
import { jsonFetch } from './json-fetch.js';
export class HttpReleaseMatrixAdapter implements ReleaseMatrixClientPort {
    async load(setId: string, signal?: AbortSignal): Promise<MatrixSnapshot> {
        const requestId = crypto.randomUUID();
        const diagnostics = createMatrixReadDiagnostics(requestId, 'browser');
        try {
            const snapshot = await jsonFetch<MatrixSnapshot>(this.path(setId), { method: 'GET', signal, headers: { 'x-matrix-request-id': requestId } });
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
}
