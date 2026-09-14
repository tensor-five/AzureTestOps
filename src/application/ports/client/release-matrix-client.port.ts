import type { MatrixSnapshot, MatrixWrite, MatrixActionResult, MatrixSuiteMembership, MatrixTagCatalog } from '../../dto/release-matrix.dto.js';
export interface ReleaseMatrixClientPort {
  load(setId: string, signal?: AbortSignal, versionSuiteIds?: readonly number[]): Promise<MatrixSnapshot>;
  record(setId: string, input: MatrixWrite): Promise<MatrixActionResult>;
  loadMembership?(setId: string, suiteId: number, contextIdentity: string, signal?: AbortSignal): Promise<MatrixSuiteMembership>;
  loadTagCatalog?(setId: string, contextIdentity: string, signal?: AbortSignal): Promise<MatrixTagCatalog>;
}
