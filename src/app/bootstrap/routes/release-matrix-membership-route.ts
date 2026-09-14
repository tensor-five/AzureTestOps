import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { buildAdoBaseUrl } from '../../../shared/azure-devops/azure-rest-client.js';
import { writeJson } from './route-helpers.js';

/** Loads only direct membership of the explicitly selected filter suite. */
export function registerReleaseMatrixMembershipRoute(ado: AdoRuntime, sets: SetRepositoryPort) {
  return async (method: string, pathname: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const match = pathname.match(/^\/phase2\/sets\/([^/]+)\/release-matrix\/memberships\/([^/]+)$/);
    if (!match) return false;
    res.setHeader('cache-control', 'no-store');
    const controller = new AbortController();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.once?.('close', closed);
    try {
      if (method !== 'GET') { writeJson(res, 405, { message: 'Methode nicht erlaubt.' }); return true; }
      const suiteId = Number(match[2]);
      if (!Number.isSafeInteger(suiteId) || suiteId <= 0) { writeJson(res, 400, { message: 'Ungültige Filter-Suite.' }); return true; }
      const set = await sets.getById(decodeURIComponent(match[1]));
      if (!set) { writeJson(res, 404, { message: 'Set nicht gefunden.' }); return true; }
      const planId = Number(set.planId);
      if (!Number.isSafeInteger(planId) || planId <= 0) { writeJson(res, 400, { message: 'Ungültiger Testplan.' }); return true; }
      const fallback = await ado.resolveContext();
      const context = Object.freeze({ organization: set.organization ?? fallback.organization, project: set.project ?? fallback.project });
      const contextIdentity = buildAdoBaseUrl(context).toLowerCase();
      const requestedContext = new URL(req.url ?? '/', 'http://localhost').searchParams.get('contextIdentity');
      if (requestedContext !== contextIdentity) { writeJson(res, 409, { message: 'Der Azure-Kontext hat sich geändert. Bitte die Matrix aktualisieren.' }); return true; }
      if (!ado.matrixServices) throw new Error('Suite-Zugehörigkeit ist in dieser Laufzeit nicht verfügbar.');
      controller.signal.throwIfAborted();
      const workItemIds = await ado.matrixServices(context, { signal: controller.signal }).testManagement.listTestCasesInSuite(planId, suiteId);
      controller.signal.throwIfAborted();
      if (!workItemIds.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Ungültige Suite-Zugehörigkeit von Azure.');
      writeJson(res, 200, { planId, suiteId, contextIdentity, workItemIds: [...new Set(workItemIds)] });
    } catch (error) {
      if (!controller.signal.aborted) writeJson(res, 500, { message: error instanceof Error ? error.message : 'Suite-Zugehörigkeit konnte nicht geladen werden.' });
    } finally { res.removeListener?.('close', closed); }
    return true;
  };
}
