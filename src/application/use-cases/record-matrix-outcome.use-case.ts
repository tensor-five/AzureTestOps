import type { MatrixOutcomeTarget, MatrixWriteResult } from '../dto/release-matrix.dto.js';
import type { TestExecutionPort } from '../ports/test-execution.port.js';
import { manualOutcomes } from '../../domain/release-matrix/matrix-config.js';
import { ApiError } from '../dto/api-error.js';
import type { TestOutcomeReadPort } from '../ports/test-outcome-read.port.js';
import { readOutcomeTarget, settleOutcomeReads, validateOutcomeTargetIds } from './matrix-outcome-target.js';
import { createOutcomeDiagnostics, type MatrixWriteDiagnostics, type MatrixWriteDiagnosticFields, type MatrixWriteStage } from './record-matrix-outcome-diagnostics.js';
/** Each invocation creates one new manual run. Never retries the non-idempotent creation. */
export async function recordMatrixOutcome(input: MatrixOutcomeTarget, deps: {
    outcomeRead: TestOutcomeReadPort;
    execution: TestExecutionPort;
    diagnostics?: MatrixWriteDiagnostics;
}): Promise<MatrixWriteResult> {
    const emit = createOutcomeDiagnostics(deps.diagnostics);
    let stage: MatrixWriteStage = 'validate-target';
    let fields: MatrixWriteDiagnosticFields = { planId: input.planId, suiteId: input.suiteId, workItemId: input.workItemId, pointId: input.pointId, outcome: input.outcome };
    const start = (next: MatrixWriteStage) => { stage = next; emit(stage, 'start', fields); };
    start('validate-target');
    try {
        validateOutcomeTargetIds(input);
        if (!manualOutcomes.includes(input.outcome)) throw new Error('Ungültiges Ergebnis.');
        const { caseFound, points } = await readOutcomeTarget(input, deps.outcomeRead);
        fields = { ...fields, caseCount: caseFound ? 1 : 0, pointCount: points.length, caseFound };
        if (!caseFound || points.length !== 1 || points[0].pointId !== input.pointId)
            throw new Error('Kein eindeutiger Testpunkt für diesen Testfall in dieser Suite.');
        emit(stage, 'complete', fields);
    } catch (error) {
        emit(stage, 'error', fields, error);
        throw new ApiError(500, 'MATRIX_WRITE_NOT_ATTEMPTED', 'Die Statusänderung wurde nicht gestartet. Das Schreibziel konnte nicht sicher geprüft werden. Bitte die Ansicht aktualisieren und erneut versuchen.', { pointId: input.pointId });
    }
    let runId: number | null = null;
    try {
        start('create-run');
        runId = await deps.execution.createManualRun(input.planId, input.pointId);
        fields = { ...fields, runId };
        emit(stage, 'complete', fields);
        start('find-result');
        const loadedResults = await deps.outcomeRead.loadResultsForRun(runId);
        const results = loadedResults.filter(r => r.runId === runId && r.workItemId === input.workItemId && r.pointId === input.pointId && (r.suiteId === null || r.suiteId === input.suiteId));
        fields = { ...fields, resultCount: loadedResults.length, matchingResultCount: results.length };
        if (results.length !== 1)
            throw new Error('Das neue Ergebnis ist nicht eindeutig.');
        fields = { ...fields, resultId: results[0].resultId };
        emit(stage, 'complete', fields);
        start('complete-result');
        await deps.execution.completeResult(runId, results[0].resultId, input.outcome);
        emit(stage, 'complete', fields);
        start('complete-run');
        await deps.execution.completeRun(runId);
        emit(stage, 'complete', fields);
        start('confirm-run');
        const [target, completedRun, confirmedResult] = await settleOutcomeReads([
            readOutcomeTarget(input, deps.outcomeRead),
            deps.outcomeRead.loadRun(runId),
            deps.outcomeRead.loadResult(runId, results[0].resultId),
        ] as const);
        fields = { ...fields, runCount: completedRun ? 1 : 0, runFound: !!completedRun, runState: completedRun?.state };
        if (completedRun?.runId !== runId || completedRun.planId !== input.planId || completedRun.state !== 'Completed')
            throw new Error('Der neue Durchlauf ist noch nicht als abgeschlossen bestätigt.');
        emit(stage, 'complete', fields);
        start('confirm-projection');
        const point = target.points[0];
        const resultMatches = confirmedResult?.runId === runId && confirmedResult.resultId === results[0].resultId
            && confirmedResult.workItemId === input.workItemId && confirmedResult.pointId === input.pointId
            && (confirmedResult.suiteId === null || confirmedResult.suiteId === input.suiteId)
            && confirmedResult.state === 'Completed' && confirmedResult.outcome === input.outcome
            && confirmedResult.completedDate !== null && Number.isFinite(Date.parse(confirmedResult.completedDate));
        const pointMatches = target.caseFound && target.points.length === 1 && point.pointId === input.pointId
            && point.lastRunId === runId && point.lastResultId === results[0].resultId && point.lastOutcome === input.outcome;
        fields = { ...fields, caseFound: target.caseFound, pointCount: target.points.length, pointMatches, resultMatches,
            lastRunId: point?.lastRunId, lastResultId: point?.lastResultId, lastOutcome: point?.lastOutcome, testPointId: point?.pointId };
        if (!pointMatches || !resultMatches || !confirmedResult) throw new Error('Der aktuelle Testpunkt bestätigt das neue Ergebnis noch nicht.');
        const projection = { suiteId: input.suiteId, workItemId: input.workItemId, testPointId: input.pointId,
            lastOutcome: input.outcome, lastRunId: runId, lastResultId: confirmedResult.resultId,
            // Preserve the existing point fallback when Azure omits the suite on a result.
            lastResultCompletedDate: confirmedResult.suiteId === null ? null : confirmedResult.completedDate };
        emit(stage, 'complete', fields);
        return { runId, projection };
    }
    catch (error) {
        emit(stage, 'error', fields, error);
        if (runId === null && error instanceof ApiError && error.code === 'MATRIX_WRITE_NOT_ATTEMPTED') throw error;
        throw new ApiError(500, 'MATRIX_RUN_UNCONFIRMED', runId === null ? 'Durchlauf konnte nicht sicher angelegt werden. Bitte Azure prüfen, bevor du erneut speicherst.' : `Durchlauf ${runId} wurde angelegt, Ergebnis nicht bestätigt. Bitte diesen Durchlauf in Azure prüfen; es wird nicht automatisch erneut gespeichert.`, { runId, pointId: input.pointId });
    }
}
