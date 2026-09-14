import { ApiError } from '../dto/api-error.js';
import type { MatrixResetTarget, MatrixResetResult } from '../dto/release-matrix.dto.js';
import type { TestPointResetPort } from '../ports/test-point-reset.port.js';
import type { TestPoint } from '../../domain/test-management/test-point.js';
import { isActiveTestPoint } from '../../domain/test-management/active-test-point.js';
import { loadTestCaseProjections, type LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
import { createOutcomeDiagnostics, type MatrixWriteDiagnostics, type MatrixWriteDiagnosticFields, type MatrixWriteStage } from './record-matrix-outcome-diagnostics.js';

export async function resetMatrixPoint(input: MatrixResetTarget, deps: LoadTestCaseProjectionsDeps & {
  pointReset: TestPointResetPort; diagnostics?: MatrixWriteDiagnostics;
}): Promise<MatrixResetResult> {
  const emit = createOutcomeDiagnostics(deps.diagnostics);
  let stage: MatrixWriteStage = 'validate-target';
  let fields: MatrixWriteDiagnosticFields = { planId: input.planId, suiteId: input.suiteId, workItemId: input.workItemId, pointId: input.pointId, outcome: input.outcome };
  let attempted = false;
  const start = (next: MatrixWriteStage) => { stage = next; emit(stage, 'start', fields); };
  try {
    start('validate-target');
    if (input.outcome !== 'ResetToActive' || ![input.planId, input.suiteId, input.workItemId, input.pointId].every(n => Number.isSafeInteger(n) && n > 0))
      throw new Error('Ungültiges Ergebnis oder Schreibziel.');
    const ids = await deps.testManagement.listTestCasesInSuite(input.planId, input.suiteId);
    const points = (await deps.testManagement.loadPointsForSuite(input.planId, input.suiteId))
      .filter(p => p.workItemId === input.workItemId && p.suiteId === input.suiteId);
    fields = { ...fields, caseCount: ids.length, pointCount: points.length, caseFound: ids.includes(input.workItemId) };
    if (!ids.includes(input.workItemId) || points.length !== 1 || points[0].pointId !== input.pointId)
      throw new Error('Kein eindeutiger Testpunkt für diesen Testfall in dieser Suite.');
    emit(stage, 'complete', fields);
    start('reset-point');
    attempted = true;
    await deps.pointReset.resetToActive(input.planId, input.suiteId, input.pointId);
    emit(stage, 'complete', fields);
    start('confirm-active-point');
    let freshPoints: TestPoint[] = [];
    const loaded = await loadTestCaseProjections({ planId: input.planId, rootSuiteId: input.suiteId }, {
      ...deps, testManagement: {
        loadSuiteTree: (p, s) => deps.testManagement.loadSuiteTree(p, s),
        listTestCasesInSuite: (p, s) => deps.testManagement.listTestCasesInSuite(p, s),
        listRunsForPlan: p => deps.testManagement.listRunsForPlan(p),
        loadResultsForRun: r => deps.testManagement.loadResultsForRun(r),
        loadPointsForSuite: async (p, s) => {
          const loadedPoints = await deps.testManagement.loadPointsForSuite(p, s);
          if (s === input.suiteId) freshPoints = loadedPoints.filter(point => point.suiteId === s && point.workItemId === input.workItemId);
          return loadedPoints;
        },
      },
    });
    const projection = loaded.projections.find(p => p.suiteId === input.suiteId && p.workItemId === input.workItemId);
    const pointMatches = freshPoints.length === 1 && freshPoints[0].pointId === input.pointId && isActiveTestPoint(freshPoints[0]);
    fields = { ...fields, pointCount: freshPoints.length, pointMatches, projectionFound: !!projection,
      lastRunId: projection?.lastRunId, lastResultId: projection?.lastResultId, lastOutcome: projection?.lastOutcome };
    if (!pointMatches || !projection || projection.testPointId !== input.pointId || projection.lastOutcome !== 'Unspecified'
      || projection.lastRunId !== null || projection.lastResultId !== null)
      throw new Error('Der aktuelle Testpunkt bestätigt Active noch nicht.');
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
