import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { AzureTestCaseTagsAdapter } from '../../../adapters/azure-devops/test-management/azure-test-case-tags.adapter.js';

const context = { organization: 'contract-org', project: 'contract-project' };
const contextIdentity = 'https://dev.azure.com/contract-org/contract-project';
it('exposes the complete tag catalog only in the selected set plan and context', async () => {
  const { azure, services } = matrixTestServices();
  const matrixServices = vi.fn(() => ({ ...services, caseTags: new AzureTestCaseTagsAdapter(azure.client, context) }));
  const route = registerReleaseMatrixRoutes({ matrixServices, resolveContext: async () => context } as unknown as AdoRuntime,
    { getById: async (id: string) => id === 'set' ? { id, planId: '1' } : null } as unknown as SetRepositoryPort);
  async function call(setId: string, identity: string) {
    const path = `/phase2/sets/${setId}/release-matrix/tags`;
    const req = Readable.from([]) as IncomingMessage; req.url = `${path}?contextIdentity=${encodeURIComponent(identity)}`;
    const response = { status: 0, body: {} as Record<string, unknown> };
    const res = { set statusCode(value: number) { response.status = value; }, setHeader() {}, end(value: string) { response.body = JSON.parse(value); } } as unknown as ServerResponse;
    expect(await route('GET', path, req, res)).toBe(true);
    return response;
  }
  expect((await call('missing', contextIdentity)).status).toBe(404);
  expect((await call('set', 'other')).status).toBe(409);
  expect(matrixServices).not.toHaveBeenCalled();
  expect(await call('set', contextIdentity)).toEqual({ status: 200, body: { planId: 1, contextIdentity, tags: ['2.1.0-Test', 'Data Import', 'Regress', 'Regression'] } });
  expect(azure.reads.some(url => /\/(points|runs|results)(?:[/?]|$)/i.test(url))).toBe(false);
  expect(azure.writes).toEqual([]);
});
