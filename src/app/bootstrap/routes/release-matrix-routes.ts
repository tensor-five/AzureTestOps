import { MatrixWriteHttpMetrics } from '../../../shared/azure-devops/matrix-write-http-metrics.js';
import { randomUUID } from 'node:crypto';
import { createMatrixReadDiagnostics } from '../../../shared/diagnostics/matrix-read-diagnostics.js';
import { buildAdoBaseUrl } from "../../../shared/azure-devops/azure-rest-client.js";
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import type { MatrixWrite } from '../../../application/dto/release-matrix.dto.js';
import type { TestExecutionPort } from '../../../application/ports/test-execution.port.js';
import { loadReleaseMatrix } from '../../../application/use-cases/load-release-matrix.use-case.js';
import { recordMatrixOutcome } from '../../../application/use-cases/record-matrix-outcome.use-case.js';
import { resetMatrixPoint } from '../../../application/use-cases/reset-matrix-point.use-case.js';
import { ApiError } from '../../../application/dto/api-error.js';
import type { MatrixWriteDiagnostics } from '../../../application/use-cases/record-matrix-outcome-diagnostics.js';
import { readBody, parseJsonBody, writeJson } from './route-helpers.js';
import { registerReleaseMatrixMembershipRoute } from './release-matrix-membership-route.js';
import { registerReleaseMatrixTagsRoute } from './release-matrix-tags-route.js';
export function registerReleaseMatrixRoutes(ado: AdoRuntime, sets: SetRepositoryPort) {
    const membershipRoute = registerReleaseMatrixMembershipRoute(ado, sets);
    const tagsRoute = registerReleaseMatrixTagsRoute(ado, sets);
    const pending = new Set<string>();
    return async (method: string, pathname: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
        if (await membershipRoute(method, pathname, req, res)) return true;
        if (await tagsRoute(method, pathname, req, res)) return true;
        const match = pathname.match(/^\/phase2\/sets\/([^/]+)\/release-matrix(\/outcomes)?$/);
        if (!match)
            return false;
        let lock: string | null = null;
        let createdRunId: number | null = null;
        const reading = !match[2] && method === 'GET';
        const providedId = req.headers?.['x-matrix-request-id'];
        const requestId = typeof providedId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providedId) ? providedId : randomUUID();
        const writeStartedAt = performance.now();
        const writeMetrics = match[2] && method === 'POST' ? new MatrixWriteHttpMetrics() : undefined;
        const diagnostics = reading ? createMatrixReadDiagnostics(requestId, 'server') : undefined;
        const controller = new AbortController();
        const closed = () => { if (!res.writableEnded) { controller.abort(); diagnostics?.finish('aborted'); } };
        if (reading) { res.setHeader('x-matrix-request-id', requestId); res.once?.('close', closed); }
        try {
            if (method !== (match[2] ? 'POST' : 'GET')) {
                writeJson(res, 405, { message: 'Methode nicht erlaubt.' });
                return true;
            }
            const body = match[2] ? parseJsonBody(await readBody(req)) as MatrixWrite | null : null;
            const set = await sets.getById(decodeURIComponent(match[1]));
            if (!set) {
                writeJson(res, 404, { message: 'Set nicht gefunden.' });
                return true;
            }
            const planId = Number(set.planId);
            if (!Number.isSafeInteger(planId) || planId <= 0)
                throw new Error('Ungültiger Testplan.');
            // Capture one immutable context; a concurrent set switch must not retarget this request.
            const fallback = await ado.resolveContext();
            const context = Object.freeze({ organization: set.organization ?? fallback.organization, project: set.project ?? fallback.project });
            const contextIdentity = buildAdoBaseUrl(context).toLowerCase();
            if (!ado.matrixServices)
                throw new Error('Release-Matrix ist in dieser Laufzeit nicht verfügbar.');
            if (!match[2]) {
                const requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('versions');
                let versionSuiteIds: number[] | undefined;
                if (requested !== null) {
                    const parsed = parseJsonBody(requested);
                    if (!Array.isArray(parsed) || !parsed.every(id => Number.isSafeInteger(id) && id > 0)) {
                        writeJson(res, 400, {message: 'Ungültige Versionsauswahl.'}); return true;
                    }
                    versionSuiteIds = [...new Set(parsed)];
                }
                const options = { signal: controller.signal, diagnostics, versionSuiteIds };
                const snapshot = await loadReleaseMatrix(planId, ado.matrixServices(context, options), options);
                writeJson(res, 200, { ...snapshot, contextIdentity });
                diagnostics?.finish('complete');
                return true;
            }
            if (!body || body.planId !== planId) {
                writeJson(res, 400, { message: 'Testplan stimmt nicht mit dem Set überein.' });
                return true;
            }
            if (body.contextIdentity !== contextIdentity) {
                writeJson(res, 409, { message: 'Der Azure-Kontext hat sich seit dem Laden der Matrix geändert. Bitte die Matrix aktualisieren; es wurde kein Durchlauf erzeugt.' });
                return true;
            }
            const services = ado.matrixServices(context, { writeMetrics });
            const outcomeRead = services.outcomeRead;
            if (!outcomeRead) throw new ApiError(500, body.outcome === 'ResetToActive' ? 'MATRIX_RESET_NOT_ATTEMPTED' : 'MATRIX_WRITE_NOT_ATTEMPTED',
                'Die Statusänderung wurde nicht gestartet: Gezielte Testpunktprüfung ist nicht verfügbar.', { pointId: body.pointId });
            const key = JSON.stringify([contextIdentity, planId, body.pointId]);
            if (pending.has(key)) {
                writeJson(res, 409, { message: 'Für diesen Testpunkt wird bereits ein Durchlauf gespeichert.' });
                return true;
            }
            pending.add(key);
            lock = key;
            const writeDiagnostics: MatrixWriteDiagnostics = { event: entry => console.info('[release-matrix.write]', {
                requestId, side: 'server', ...entry, elapsedMs: Math.round(performance.now() - writeStartedAt),
            }) };
            if (body.outcome === 'ResetToActive') {
                if (!services.pointReset) throw new ApiError(500, 'MATRIX_RESET_NOT_ATTEMPTED',
                    'Reset auf Active wurde nicht gestartet: Diese Laufzeit unterstützt den Vorgang nicht.', { pointId: body.pointId });
                writeJson(res, 200, await resetMatrixPoint(body, { outcomeRead, pointReset: services.pointReset, diagnostics: writeDiagnostics }));
                return true;
            }
            // Preserve the existing use case while exposing whether a failed write already created a run.
            const execution: TestExecutionPort = {
                createManualRun: async (plan, point) => {
                    createdRunId = await services.execution.createManualRun(plan, point);
                    return createdRunId;
                },
                completeResult: (run, result, outcome) => services.execution.completeResult(run, result, outcome),
                completeRun: run => services.execution.completeRun(run),
            };
            writeJson(res, 200, await recordMatrixOutcome(body, { outcomeRead, execution, diagnostics: writeDiagnostics }));
        }
        catch (error) {
            diagnostics?.finish(controller.signal.aborted ? 'aborted' : 'error');
            if (controller.signal.aborted) return true;
            writeJson(res, 500, { ...(error instanceof ApiError && ['MATRIX_RESET_UNCONFIRMED', 'MATRIX_RESET_NOT_ATTEMPTED', 'MATRIX_RUN_UNCONFIRMED', 'MATRIX_WRITE_NOT_ATTEMPTED'].includes(error.code) ? { code: error.code, details: error.details }
                : createdRunId !== null ? {code:'MATRIX_RUN_UNCONFIRMED',details:{runId:createdRunId}} : {}), message: error instanceof Error ? error.message : 'Release-Matrix konnte nicht geladen oder gespeichert werden.' });
        }
        finally {
            if (writeMetrics) {
                try { console.info('[release-matrix.write-summary]', { requestId, side: 'server',
                    event: res.statusCode === 200 ? 'confirmed' : 'error', ...writeMetrics.snapshot() }); } catch { /* Diagnostics do not affect writes. */ }
            }
            res.removeListener?.('close', closed);
            diagnostics?.finish(controller.signal.aborted ? 'aborted' : 'error');
            if (lock)
                pending.delete(lock);
        }
        return true;
    };
}
