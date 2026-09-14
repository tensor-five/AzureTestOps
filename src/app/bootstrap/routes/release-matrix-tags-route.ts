import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { buildAdoBaseUrl } from '../../../shared/azure-devops/azure-rest-client.js';
import { loadMatrixTagCatalog } from '../../../application/use-cases/load-matrix-tag-catalog.use-case.js';
import { writeJson } from './route-helpers.js';

export function registerReleaseMatrixTagsRoute(ado: AdoRuntime, sets: SetRepositoryPort) {
  return async (method: string, pathname: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const match = pathname.match(/^\/phase2\/sets\/([^/]+)\/release-matrix\/tags$/);
    if (!match) return false;
    res.setHeader('cache-control', 'no-store');
    const controller = new AbortController();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.once?.('close', closed);
    try {
      if (method !== 'GET') { writeJson(res, 405, { message: 'Methode nicht erlaubt.' }); return true; }
      const set = await sets.getById(decodeURIComponent(match[1]));
      if (!set) { writeJson(res, 404, { message: 'Set nicht gefunden.' }); return true; }
      const planId = Number(set.planId);
      if (!Number.isSafeInteger(planId) || planId <= 0) { writeJson(res, 400, { message: 'Ungültiger Testplan.' }); return true; }
      const fallback = await ado.resolveContext();
      const context = Object.freeze({ organization: set.organization ?? fallback.organization, project: set.project ?? fallback.project });
      const contextIdentity = buildAdoBaseUrl(context).toLowerCase();
      if (new URL(req.url ?? '/', 'http://localhost').searchParams.get('contextIdentity') !== contextIdentity) {
        writeJson(res, 409, { message: 'Der Azure-Kontext hat sich geändert. Bitte die Matrix aktualisieren.' }); return true;
      }
      const services = ado.matrixServices?.(context, { signal: controller.signal });
      if (!services?.caseTags) throw new Error('Tagkatalog ist in dieser Laufzeit nicht verfügbar.');
      const tags = await loadMatrixTagCatalog(planId, { ...services, caseTags: services.caseTags }, controller.signal);
      writeJson(res, 200, { planId, contextIdentity, tags });
    } catch (error) {
      if (!controller.signal.aborted) writeJson(res, 500, { message: error instanceof Error ? error.message : 'Tagkatalog konnte nicht geladen werden.' });
    } finally { res.removeListener?.('close', closed); }
    return true;
  };
}
