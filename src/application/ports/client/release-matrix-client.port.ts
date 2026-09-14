import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult } from '../../dto/release-matrix.dto.js';
export interface ReleaseMatrixClientPort {
  load(setId: string, signal?: AbortSignal): Promise<MatrixSnapshot>;
  record(setId: string, input: MatrixWrite): Promise<MatrixWriteResult>;
}
