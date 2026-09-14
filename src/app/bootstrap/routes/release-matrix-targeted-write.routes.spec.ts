import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';

const input = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Passed', contextIdentity: 'https://dev.azure.com/contract-org/contract-project' };
function fixture() {
  const backend = matrixTestServices();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const route = registerReleaseMatrixRoutes({ resolveContext: async () => ({ organization: 'contract-org', project: 'contract-project' }), matrixServices: () => backend.services } as unknown as AdoRuntime,
    { getById: async () => ({ id: 'catalog', planId: '1' }) } as unknown as SetRepositoryPort);
  async function call(body = input) {
    const result = { status: 0, body: {} as Record<string, unknown> };
    const res = { set statusCode(value: number) { result.status = value; }, setHeader() {}, end(value: string) { result.body = JSON.parse(value); } } as unknown as ServerResponse;
    await route('POST', '/phase2/sets/catalog/release-matrix/outcomes', Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage, res);
    return result;
  }
  return { ...backend, call };
}
afterEach(() => vi.restoreAllMocks());
it('returns only the confirmed outcome fields without a whole matrix read', async () => {
  const backend = fixture();
  const response = await backend.call();
  expect(response.status).toBe(200);
  expect(Object.keys(response.body.projection as object).sort()).toEqual(['lastOutcome', 'lastResultCompletedDate', 'lastResultId', 'lastRunId', 'suiteId', 'testPointId', 'workItemId']);
  expect(backend.azure.reads).toHaveLength(7);
});
it('keeps uncertain creation structured even when no run ID reached the caller', async () => {
  const backend = fixture();
  const create = vi.spyOn(backend.azure.client, 'post').mockRejectedValue(new TypeError('Connection lost'));
  expect(await backend.call()).toMatchObject({ status: 500, body: { code: 'MATRIX_RUN_UNCONFIRMED', details: { runId: null, pointId: 21201 } } });
  expect(create).toHaveBeenCalledTimes(1);
});
it('serializes a definite create rejection as safely not attempted', async () => {
  const backend = fixture();
  backend.azure.control.failWrite = true;
  expect(await backend.call()).toMatchObject({ status: 500, body: { code: 'MATRIX_WRITE_NOT_ATTEMPTED' } });
  expect(backend.azure.writes).toHaveLength(0);
});
