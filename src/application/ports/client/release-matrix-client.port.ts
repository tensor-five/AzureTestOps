import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult } from '../../dto/release-matrix.dto.js';
export interface ReleaseMatrixClientPort {
  load(setId: string): Promise<MatrixSnapshot>;
  record(setId: string, input: MatrixWrite): Promise<MatrixWriteResult>;
}
