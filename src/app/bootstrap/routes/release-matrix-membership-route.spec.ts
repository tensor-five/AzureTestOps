import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { loadReleaseMatrix } from '../../../application/use-cases/load-release-matrix.use-case.js';

const contextIdentity = 'https://dev.azure.com/contract-org/contract-project';
function fixture() {
  const backend = matrixTestServices();
  const matrixServices = vi.fn(() => backend.services);
  const set = { id: 'set', planId: '1' };
  const route = registerReleaseMatrixRoutes({ matrixServices, resolveContext: async () => ({ organization: 'contract-org', project: 'contract-project' }) } as unknown as AdoRuntime,
    { getById: async (id: string) => id === set.id ? set : null } as unknown as SetRepositoryPort);
  async function call(suite = '43', context = contextIdentity, setId = 'set') {
    const path = `/phase2/sets/${setId}/release-matrix/memberships/${suite}`;
    const req = Readable.from([]) as IncomingMessage; req.url = `${path}?contextIdentity=${encodeURIComponent(context)}`;
    const response = { status: 0, body: {} as Record<string, unknown> };
    const res = { set statusCode(value: number) { response.status = value; }, setHeader() {}, end(value: string) { response.body = JSON.parse(value); } } as unknown as ServerResponse;
    expect(await route('GET', path, req, res)).toBe(true);
    return response;
  }
  return { ...backend, matrixServices, set, call };
}
it('reads only direct membership of the explicitly requested filter suite', async () => {
  const f = fixture();
  expect(await f.call()).toEqual({ status: 200, body: { planId: 1, suiteId: 43, contextIdentity, workItemIds: [201] } });
  expect(f.azure.reads).toHaveLength(1);
  expect(new URL(f.azure.reads[0]).pathname).toMatch(/Plans\/1\/suites\/43\/testcases$/);
  expect(f.azure.writes).toHaveLength(0);
});
it('rejects different contexts, invalid plans and missing sets before any Azure read', async () => {
  const f = fixture();
  expect((await f.call('43', 'other')).status).toBe(409);
  expect((await f.call('43', contextIdentity, 'missing')).status).toBe(404);
  f.set.planId = 'invalid';
  expect((await f.call()).status).toBe(400);
  expect(f.matrixServices).not.toHaveBeenCalled();
});
it('transmits only memberships of suites actually read, including empty loaded suites', async () => {
  const { services } = matrixTestServices();
  const none = await loadReleaseMatrix(1, services, { versionSuiteIds: [] });
  expect(none.suiteMemberships).toEqual({});
  const all = await loadReleaseMatrix(1, services);
  expect(all.suiteMemberships?.['21']).toEqual([101, 201, 103]);
  expect(all.suiteMemberships?.['1']).toEqual([]);
});
it.each(['0','-1','not-a-suite','1.5'])('rejects invalid suite identifiers before any Azure read: %s',async suite=>{
 const f=fixture();expect((await f.call(suite)).status).toBe(400);expect(f.matrixServices).not.toHaveBeenCalled();
});
it('returns a visible failure when membership cannot be read, without execution reads',async()=>{
 const f=fixture();vi.spyOn(f.services.testManagement,'listTestCasesInSuite').mockRejectedValue(new Error('Membership unavailable'));
 const response=await f.call();expect(response.status).toBe(500);expect(response.body.message).toContain('Membership unavailable');expect(f.azure.reads).toHaveLength(0);
});
