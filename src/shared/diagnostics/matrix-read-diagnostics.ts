import { createViewReadDiagnostics } from './view-read-diagnostics.js';

export type MatrixReadDiagnostics = ReturnType<typeof createMatrixReadDiagnostics>;
/** Preserve the existing matrix diagnostic API and log prefix. */
export function createMatrixReadDiagnostics(requestId: string, side: 'browser' | 'server', sink?: (entry: object) => void) {
    return createViewReadDiagnostics('release-matrix', requestId, side, sink);
}
