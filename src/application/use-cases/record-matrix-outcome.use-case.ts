import type { MatrixOutcomeTarget, MatrixWriteResult } from '../dto/release-matrix.dto.js';
import type { TestExecutionPort } from '../ports/test-execution.port.js';
import { manualOutcomes } from '../../domain/release-matrix/matrix-config.js';
import { loadTestCaseProjections, type LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
import { createOutcomeDiagnostics, type MatrixWriteDiagnostics, type MatrixWriteDiagnosticFields, type MatrixWriteStage } from './record-matrix-outcome-diagnostics.js';
/** Each invocation creates one new manual run. Never retries the non-idempotent creation. */
export async function recordMatrixOutcome(input: MatrixOutcomeTarget, deps: LoadTestCaseProjectionsDeps & {
    execution: TestExecutionPort;
    diagnostics?: MatrixWriteDiagnostics;
}): Promise<MatrixWriteResult> {
    const emit = createOutcomeDiagnostics(deps.diagnostics);
    let stage: MatrixWriteStage = 'validate-target';
    let fields: MatrixWriteDiagnosticFields = { planId: input.planId, suiteId: input.suiteId, workItemId: input.workItemId, pointId: input.pointId, outcome: input.outcome };
    const start = (next: MatrixWriteStage) => { stage = next; emit(stage, 'start', fields); };
    start('validate-target');
    try {
        if (!manualOutcomes.includes(input.outcome) || ![input.planId, input.suiteId, input.workItemId, input.pointId].every(n => Number.isSafeInteger(n) && n > 0))
            throw new Error('Ungültiges Ergebnis oder Schreibziel.');
        const ids = await deps.testManagement.listTestCasesInSuite(input.planId, input.suiteId);
        const points = (await deps.testManagement.loadPointsForSuite(input.planId, input.suiteId)).filter(p => p.workItemId === input.workItemId && p.suiteId === input.suiteId);
        fields = { ...fields, caseCount: ids.length, pointCount: points.length, caseFound: ids.includes(input.workItemId) };
        if (!ids.includes(input.workItemId) || points.length !== 1 || points[0].pointId !== input.pointId)
            throw new Error('Kein eindeutiger Testpunkt für diesen Testfall in dieser Suite.');
        emit(stage, 'complete', fields);
    } catch (error) {
        emit(stage, 'error', fields, error);
        throw error;
    }
    let runId: number | null = null;
    try {
        start('create-run');
        runId = await deps.execution.createManualRun(input.planId, input.pointId);
        fields = { ...fields, runId };
        emit(stage, 'complete', fields);
        start('find-result');
        const loadedResults = await deps.testManagement.loadResultsForRun(runId);
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
        const runs = await deps.testManagement.listRunsForPlan(input.planId);
        const completedRun = runs.find(run => run.runId === runId);
        fields = { ...fields, runCount: runs.length, runFound: !!completedRun, runState: completedRun?.state };
        if (completedRun?.state !== 'Completed') throw new Error('Der neue Durchlauf ist noch nicht als abgeschlossen bestätigt.');
        emit(stage, 'complete', fields);
        start('confirm-projection');
        const loaded = await loadTestCaseProjections({ planId: input.planId, rootSuiteId: input.suiteId }, deps);
        const projection = loaded.projections.find(p => p.suiteId === input.suiteId && p.workItemId === input.workItemId);
        fields = { ...fields, projectionCount: loaded.projections.length, projectionFound: !!projection,
            lastRunId: projection?.lastRunId, lastResultId: projection?.lastResultId, lastOutcome: projection?.lastOutcome,
            testPointId: projection?.testPointId, runMatches: projection?.lastRunId === runId,
            resultMatches: projection?.lastResultId === results[0].resultId, outcomeMatches: projection?.lastOutcome === input.outcome };
        if (!projection || projection.lastRunId !== runId || projection.lastResultId !== results[0].resultId || projection.lastOutcome !== input.outcome)
            throw new Error('Der bestehende Lesepfad bestätigt das neue Ergebnis noch nicht.');
        emit(stage, 'complete', fields);
        return { runId, projection };
    }
    catch (error) {
        emit(stage, 'error', fields, error);
        throw new Error(runId === null ? 'Durchlauf konnte nicht sicher angelegt werden. Bitte Azure prüfen, bevor du erneut speicherst.' : `Durchlauf ${runId} wurde angelegt, Ergebnis nicht bestätigt. Bitte diesen Durchlauf in Azure prüfen; es wird nicht automatisch erneut gespeichert.`);
    }
}
