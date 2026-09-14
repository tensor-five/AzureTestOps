import { ApiError } from '../../application/dto/api-error.js';
import type { MatrixActionResult, MatrixWrite } from '../../application/dto/release-matrix.dto.js';

/** Treat malformed 2xx responses exactly like a lost response; never publish an unverified delta. */
export function validateMatrixConfirmation(value: unknown, input: MatrixWrite): asserts value is MatrixActionResult {
  const result = value as MatrixActionResult | null;
  const projection = result?.projection;
  const positive = (id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
  const identity = projection?.suiteId === input.suiteId && projection?.workItemId === input.workItemId
    && projection?.testPointId === input.pointId;
  const date = projection?.lastResultCompletedDate;
  const validDate = date === null || typeof date === 'string' && Number.isFinite(Date.parse(date));
  const outcome = input.outcome === 'ResetToActive'
    ? result?.runId === null && 'resetToActive' in result && result.resetToActive === true
      && projection?.lastOutcome === 'Unspecified' && projection.lastRunId === null
      && projection.lastResultId === null && date === null
    : positive(result?.runId) && projection?.lastRunId === result?.runId && positive(projection?.lastResultId)
      && projection?.lastOutcome === input.outcome && validDate;
  if (!identity || !outcome) throw new ApiError(500, 'MATRIX_INVALID_CONFIRMATION',
    'Azure-Bestätigung ist unvollständig oder gehört nicht zum angeforderten Testpunkt.');
}
