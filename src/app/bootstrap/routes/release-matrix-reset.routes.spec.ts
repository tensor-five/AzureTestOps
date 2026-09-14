import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { resetActiveServices } from '../../../../tests/fixtures/reset-active.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';

const target = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'ResetToActive', contextIdentity: 'https://dev.azure.com/contract-org/contract-project' };
function setup() {
  const fixture = resetActiveServices();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const matrixServices = vi.fn(() => fixture.services);
  const route = registerReleaseMatrixRoutes({ resolveContext: async () => ({ organization: 'contract-org', project: 'contract-project' }), matrixServices } as unknown as AdoRuntime,
    { getById: async () => ({ id: 'catalog', planId: '1' }) } as unknown as SetRepositoryPort);
  async function call(body: unknown) {
    const result = { status: 0, body: {} as Record<string, unknown> };
    const res = { set statusCode(value: number) { result.status = value; }, setHeader() {}, end(value: string) { result.body = JSON.parse(value); } } as unknown as ServerResponse;
    await route('POST', '/phase2/sets/catalog/release-matrix/outcomes', Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage, res);
    return result;
  }
  return { ...fixture, call, matrixServices };
}
afterEach(() => vi.restoreAllMocks());
describe('matrix reset endpoint', () => {
  it('returns confirmed Active without creating an execution', async () => {
    const fixture = setup();
    expect(await fixture.call(target)).toMatchObject({ status: 200, body: { runId: null, resetToActive: true, projection: { lastOutcome: 'Unspecified', lastRunId: null } } });
    expect(fixture.azure.writes.map(w => w.method)).toEqual(['PATCH']);
  });
  it('rejects context and plan mismatches before calling Azure', async () => {
    const fixture = setup();
    expect((await fixture.call({ ...target, contextIdentity: 'other-project' })).status).toBe(409);
    expect((await fixture.call({ ...target, planId: 2 })).status).toBe(400);
    expect(fixture.matrixServices).not.toHaveBeenCalled();
    expect(fixture.azure.writes).toEqual([]);
  });
  it('serializes reset uncertainty with point identity, without an invented run id', async () => {
    const fixture = setup();
    fixture.control.staleRead = true;
    const response = await fixture.call(target);
    expect(response).toMatchObject({ status: 500, body: { code: 'MATRIX_RESET_UNCONFIRMED', details: { pointId: 21201 } } });
    expect(response.body.message).toMatch(/nicht automatisch/);
    expect(fixture.azure.writes).toHaveLength(1);
  });
  it('reports validation failure as not attempted and permits an explicit retry', async () => {
    const fixture = setup();
    vi.spyOn(fixture.services.outcomeRead, 'isCaseInSuite').mockRejectedValueOnce(new Error('TEST_CASES_HTTP_503'));
    expect(await fixture.call(target)).toMatchObject({ status: 500, body: { code: 'MATRIX_RESET_NOT_ATTEMPTED', details: { pointId: 21201 } } });
    expect(fixture.azure.writes).toHaveLength(0);
    expect((await fixture.call(target)).status).toBe(200);
    expect(fixture.azure.writes).toHaveLength(1);
  });
  it('reports a missing reset adapter as not attempted', async () => {
    const fixture = setup();
    fixture.matrixServices.mockReturnValueOnce({ ...fixture.services, pointReset: undefined } as unknown as typeof fixture.services);
    expect(await fixture.call(target)).toMatchObject({ status: 500, body: { code: 'MATRIX_RESET_NOT_ATTEMPTED', details: { pointId: 21201 } } });
    expect(fixture.azure.writes).toHaveLength(0);
  });
  it('shares the physical point lock with manual outcome writes and releases it after reset', async () => {
    const fixture = setup();
    const original = fixture.services.pointReset.resetToActive.bind(fixture.services.pointReset);
    let release!: () => void;
    let started!: () => void;
    const resetStarted = new Promise<void>(resolve => { started = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    fixture.services.pointReset.resetToActive = async (...args) => { started(); await hold; return original(...args); };
    const first = fixture.call(target);
    await resetStarted;
    expect((await fixture.call({ ...target, outcome: 'Passed' })).status).toBe(409);
    expect(fixture.azure.writes).toHaveLength(0);
    release();
    expect((await first).status).toBe(200);
    expect((await fixture.call({ ...target, outcome: 'Passed' })).status).toBe(200);
  });
});
