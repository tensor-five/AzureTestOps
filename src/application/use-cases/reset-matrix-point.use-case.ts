import { ApiError } from '../dto/api-error.js';
import type { MatrixResetTarget, MatrixResetResult } from '../dto/release-matrix.dto.js';
import type { TestPointResetPort } from '../ports/test-point-reset.port.js';
import { isActiveTestPoint } from '../../domain/test-management/active-test-point.js';
import type { TestOutcomeReadPort } from '../ports/test-outcome-read.port.js';
import { readOutcomeTarget, validateOutcomeTargetIds } from './matrix-outcome-target.js';
import { createOutcomeDiagnostics, type MatrixWriteDiagnostics, type MatrixWriteDiagnosticFields, type MatrixWriteStage } from './record-matrix-outcome-diagnostics.js';

export async function resetMatrixPoint(input: MatrixResetTarget, deps: {
  outcomeRead: TestOutcomeReadPort;
  pointReset: TestPointResetPort; diagnostics?: MatrixWriteDiagnostics;
}): Promise<MatrixResetResult> {
  const emit = createOutcomeDiagnostics(deps.diagnostics);
  let stage: MatrixWriteStage = 'validate-target';
  let fields: MatrixWriteDiagnosticFields = { planId: input.planId, suiteId: input.suiteId, workItemId: input.workItemId, pointId: input.pointId, outcome: input.outcome };
  let attempted = false;
  const start = (next: MatrixWriteStage) => { stage = next; emit(stage, 'start', fields); };
  try {
    start('validate-target');
    validateOutcomeTargetIds(input);
    if (input.outcome !== 'ResetToActive') throw new Error('Ungültiger Reset.');
    const { caseFound, points } = await readOutcomeTarget(input, deps.outcomeRead);
    fields = { ...fields, caseCount: caseFound ? 1 : 0, pointCount: points.length, caseFound };
    if (!caseFound || points.length !== 1 || points[0].pointId !== input.pointId)
      throw new Error('Kein eindeutiger Testpunkt für diesen Testfall in dieser Suite.');
    emit(stage, 'complete', fields);
    start('reset-point');
    attempted = true;
    await deps.pointReset.resetToActive(input.planId, input.suiteId, input.pointId);
    emit(stage, 'complete', fields);
    start('confirm-active-point');
    const target = await readOutcomeTarget(input, deps.outcomeRead);
    const point = target.points[0];
    const pointMatches = target.caseFound && target.points.length === 1 && point.pointId === input.pointId && isActiveTestPoint(point);
    fields = { ...fields, caseFound: target.caseFound, pointCount: target.points.length, pointMatches,
      lastRunId: point?.lastRunId, lastResultId: point?.lastResultId, lastOutcome: point?.lastOutcome };
    if (!pointMatches) throw new Error('Der aktuelle Testpunkt bestätigt Active noch nicht.');
    const projection = { suiteId: input.suiteId, workItemId: input.workItemId, testPointId: input.pointId,
      lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null };
    emit(stage, 'complete', fields);
    return { runId: null, resetToActive: true, projection };
  } catch (error) {
    emit(stage, 'error', fields, error);
    if (!attempted) throw new ApiError(500, 'MATRIX_RESET_NOT_ATTEMPTED',
      'Reset auf Active wurde nicht gestartet. Das Schreibziel konnte nicht sicher geprüft werden. Bitte die Ansicht aktualisieren und erneut versuchen.',
      { pointId: input.pointId });
    throw new ApiError(500, 'MATRIX_RESET_UNCONFIRMED', `Reset auf Active für Testpunkt ${input.pointId} wurde nicht bestätigt. Bitte Azure prüfen und die Ansicht aktualisieren; es wird nicht automatisch erneut gespeichert.`, { pointId: input.pointId });
  }
}
