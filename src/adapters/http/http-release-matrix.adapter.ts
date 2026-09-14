import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult } from '../../application/dto/release-matrix.dto.js';
import { jsonFetch } from './json-fetch.js';
export class HttpReleaseMatrixAdapter implements ReleaseMatrixClientPort {
    load(setId: string): Promise<MatrixSnapshot> { return jsonFetch(this.path(setId), { method: "GET" }); }
    record(setId: string, input: MatrixWrite): Promise<MatrixWriteResult> { return jsonFetch(this.path(setId) + '/outcomes', { method: 'POST', body: input }); }
    private path(setId: string): string { return `/phase2/sets/${encodeURIComponent(setId)}/release-matrix`; }
}
