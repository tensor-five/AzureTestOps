import { matrixTestServices } from './release-matrix.js';
import { AzureTestPointResetAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-point-reset.adapter.js';

/** Test-only Azure reset behavior preserves the old run history. */
export function resetActiveServices() {
  const fixture = matrixTestServices();
  const { azure } = fixture;
  const active = new Set<number>();
  const control = { resetStatus: 200, staleRead: false };
  const originalGet = azure.client.get.bind(azure.client);
  azure.client.get = async url => {
    const response = await originalGet(url);
    if (!/\/points\?/i.test(url) || control.staleRead || response.status !== 200) return response;
    const body = response.json as { value: Array<Record<string, unknown>> };
    return { ...response, json: { ...body, value: body.value.map(point => active.has(Number(point.id))
      ? { ...point, state: 'Ready', outcome: 'Unspecified', lastTestRun: { id: '0' }, lastResult: { id: '0' }, lastResetToActive: '2026-09-14T10:00:00Z' }
      : point) } };
  };
  const originalPatch = azure.client.patch.bind(azure.client);
  azure.client.patch = async (url, body) => {
    const match = new URL(url).pathname.match(/\/points\/(\d+)$/i);
    if (!match) return originalPatch(url, body);
    azure.writes.push({ method: 'PATCH', url, body: structuredClone(body) });
    if (control.resetStatus === 200) active.add(Number(match[1]));
    return { status: control.resetStatus, json: {} };
  };
  const originalPost = azure.client.post.bind(azure.client);
  azure.client.post = async (url, body) => {
    const response = await originalPost(url, body);
    if (/\/runs\?/i.test(url) && response.status === 200)
      for (const id of body.pointIds ?? []) active.delete(id);
    return response;
  };
  return { ...fixture, control, active, services: { ...fixture.services,
    pointReset: new AzureTestPointResetAdapter(azure.client, { organization: 'contract-org', project: 'contract-project' }) } };
}
