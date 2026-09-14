import type { MatrixOutcomeTarget, MatrixWriteResult } from '../dto/release-matrix.dto.js';
import type { TestExecutionPort } from '../ports/test-execution.port.js';
import { manualOutcomes } from '../../domain/release-matrix/matrix-config.js';
import { loadTestCaseProjections, type LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
/** Each invocation creates one new manual run. Never retries the non-idempotent creation. */
export async function recordMatrixOutcome(input: MatrixOutcomeTarget, deps: LoadTestCaseProjectionsDeps & {
    execution: TestExecutionPort;
}): Promise<MatrixWriteResult> {
    if (!manualOutcomes.includes(input.outcome) || ![input.planId, input.suiteId, input.workItemId, input.pointId].every(n => Number.isSafeInteger(n) && n > 0))
        throw new Error('Ungültiges Ergebnis oder Schreibziel.');
    const ids = await deps.testManagement.listTestCasesInSuite(input.planId, input.suiteId);
    const points = (await deps.testManagement.loadPointsForSuite(input.planId, input.suiteId)).filter(p => p.workItemId === input.workItemId && p.suiteId === input.suiteId);
    if (!ids.includes(input.workItemId) || points.length !== 1 || points[0].pointId !== input.pointId)
        throw new Error('Kein eindeutiger Testpunkt für diesen Testfall in dieser Suite.');
    let runId: number | null = null;
    try {
        runId = await deps.execution.createManualRun(input.planId, input.pointId);
        const results = (await deps.testManagement.loadResultsForRun(runId)).filter(r => r.runId === runId && r.workItemId === input.workItemId && r.pointId === input.pointId && (r.suiteId === null || r.suiteId === input.suiteId));
        if (results.length !== 1)
            throw new Error('Das neue Ergebnis ist nicht eindeutig.');
        await deps.execution.completeResult(runId, results[0].resultId, input.outcome);
        await deps.execution.completeRun(runId);
        const completedRun = (await deps.testManagement.listRunsForPlan(input.planId)).find(run => run.runId === runId);
        if (completedRun?.state !== 'Completed') throw new Error('Der neue Durchlauf ist noch nicht als abgeschlossen bestätigt.');
        const loaded = await loadTestCaseProjections({ planId: input.planId, rootSuiteId: input.suiteId }, deps);
        const projection = loaded.projections.find(p => p.suiteId === input.suiteId && p.workItemId === input.workItemId);
        if (!projection || projection.lastRunId !== runId || projection.lastResultId !== results[0].resultId || projection.lastOutcome !== input.outcome)
            throw new Error('Der bestehende Lesepfad bestätigt das neue Ergebnis noch nicht.');
        return { runId, projection };
    }
    catch {
        throw new Error(runId === null ? 'Durchlauf konnte nicht sicher angelegt werden. Bitte Azure prüfen, bevor du erneut speicherst.' : `Durchlauf ${runId} wurde angelegt, Ergebnis nicht bestätigt. Bitte diesen Durchlauf in Azure prüfen; es wird nicht automatisch erneut gespeichert.`);
    }
}
