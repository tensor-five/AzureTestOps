import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import { buildAdoBaseUrl } from '../../../shared/azure-devops/azure-rest-client.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';

type LogEntry = { requestId: string; side: string; stage: string; event: string; elapsedMs: number; fields: Record<string, unknown> };
const target = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'NotApplicable' };
const requestId = '7179eadf-3c67-4a47-89b7-54f791073077';

function setup() {
  const { services, azure } = matrixTestServices();
  const context = { organization: 'private-organization', project: 'private-project' };
  const contextIdentity = buildAdoBaseUrl(context).toLowerCase();
  const matrixServices = vi.fn(() => services);
  const route = registerReleaseMatrixRoutes({ resolveContext: async () => context, matrixServices } as unknown as AdoRuntime,
    { getById: async () => ({ id: 'catalog', name: 'Private set name', planId: '1', rootSuiteId: '1', queryId: '' }) } as unknown as SetRepositoryPort);
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const call = async () => {
    const response = { status: 0, body: {} as Record<string, unknown> };
    const res = {
      set statusCode(value: number) { response.status = value; },
      setHeader() {}, end(value: string) { response.body = JSON.parse(value); },
    } as unknown as ServerResponse;
    const req = Readable.from([Buffer.from(JSON.stringify({ ...target, contextIdentity }))]) as IncomingMessage;
    req.headers = { 'x-matrix-request-id': requestId, authorization: 'Bearer private-test-token' };
    await route('POST', '/phase2/sets/catalog/release-matrix/outcomes', req, res);
    return response;
  };
  const logs = () => info.mock.calls.filter(([prefix]) => prefix === '[release-matrix.write]').map(([, data]) => data as LogEntry);
  return { call, logs, services, azure, matrixServices, info, contextIdentity };
}

function expectCorrelatedLogs(logs: LogEntry[]) {
  expect(logs.length).toBeGreaterThan(0);
  for (const log of logs) {
    expect(Object.keys(log).sort()).toEqual(['elapsedMs', 'event', 'fields', 'requestId', 'side', 'stage']);
    expect(log.requestId).toBe(requestId);
    expect(log.side).toBe('server');
    expect(Number.isFinite(log.elapsedMs) && log.elapsedMs >= 0).toBe(true);
    expect(['start', 'complete', 'error']).toContain(log.event);
    expect(typeof log.fields).toBe('object');
  }
}

afterEach(() => { vi.restoreAllMocks(); });

describe('Matrix write request diagnostics', () => {
  it('logs correlated stages for a successful NotApplicable POST without changing the Azure service mode', async () => {
    const fixture = setup();
    const response = await fixture.call();
    const logs = fixture.logs();

    expect(response.status).toBe(200);
    expect(response.body.runId).toBe(100);
    expectCorrelatedLogs(logs);
    expect(logs[0]).toMatchObject({ stage: 'validate-target', event: 'start' });
    expect(logs.at(-1)).toMatchObject({ stage: 'confirm-projection', event: 'complete' });
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'complete-result', event: 'complete', fields: expect.objectContaining({ runId: 100, resultId: 1000, outcome: 'NotApplicable' }) })]));
    // Read diagnostics options activate caching in the runtime. A write must
    // retain the existing uncached service factory invocation.
    expect(fixture.matrixServices.mock.calls[0]).toHaveLength(1);
    expect(fixture.azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
  });

  it('locates an unconfirmed run after successful PATCHes within the same request', async () => {
    const fixture = setup();
    vi.spyOn(fixture.services.testManagement, 'listRunsForPlan').mockResolvedValue([]);
    const response = await fixture.call();
    const logs = fixture.logs();

    expect(response).toMatchObject({ status: 500, body: { code: 'MATRIX_RUN_UNCONFIRMED', details: { runId: 100 } } });
    expectCorrelatedLogs(logs);
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'complete-result', event: 'complete' }),
      expect.objectContaining({ stage: 'complete-run', event: 'complete' }),
    ]));
    expect(logs.at(-1)).toMatchObject({ stage: 'confirm-run', event: 'error', fields: { runId: 100, runCount: 0, runFound: false } });
    expect(fixture.azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
  });

  it('keeps request headers, context, raw Azure errors and stack traces out of console diagnostics', async () => {
    const fixture = setup();
    const rawError = 'sensitive-error https://private.invalid/secret user@example.invalid';
    vi.spyOn(fixture.services.execution, 'completeResult').mockRejectedValue(new Error(rawError));
    const response = await fixture.call();

    expect(response.status).toBe(500);
    expectCorrelatedLogs(fixture.logs());
    expect(fixture.logs().at(-1)).toMatchObject({ stage: 'complete-result', event: 'error' });
    const output = JSON.stringify(fixture.info.mock.calls);
    for (const forbidden of [rawError, 'private-test-token', fixture.contextIdentity, 'private-organization', 'private-project', 'Private set name', 'stack', 'https://']) {
      expect(output).not.toContain(forbidden);
    }
  });
});
