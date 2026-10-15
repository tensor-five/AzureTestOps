import { createServer, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AzureTestManagementAdapter } from '../../adapters/azure-devops/test-management/azure-test-management.adapter.js';
import { InMemoryTestResultHistoryAdapter } from '../../adapters/persistence/memory/in-memory-test-result-history.adapter.js';
import { loadTestCaseProjections } from '../../application/use-cases/load-test-case-projections.use-case.js';
import { createMatrixReadSession } from '../../application/use-cases/matrix-read-session.js';
import { FetchAzureRestClient } from '../../shared/azure-devops/fetch-azure-rest-client.js';
import { createMatrixReadHttpClient } from '../../shared/azure-devops/matrix-read-http-client.js';
import { createViewReadDiagnostics } from '../../shared/diagnostics/view-read-diagnostics.js';

const context = { organization: 'history-org', project: 'history-project' };
const run = { id: 1, plan: { id: 1 }, name: 'Completed run', state: 'Completed', totalTests: 1 };
const result = { id: 10, testRun: { id: 1 }, testCase: { id: 101 }, testSuite: { id: 10 }, testPoint: { id: 100 }, state: 'Completed', outcome: 'Passed' };
type Stage = 'runs-first' | 'runs-page' | 'results-first' | 'results-page' | 'retry-runs' | 'retry-results';

async function boundary(handle: (url: URL, response: ServerResponse) => void) {
  const server = createServer((request, response) => handle(new URL(request.url!, 'http://test.local'), response));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    transport: new FetchAzureRestClient({ fetchImpl: (url, init) => {
      const source = new URL(url);
      return fetch(`${origin}${source.pathname}${source.search}`, init);
    } }),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}
function send(response: ServerResponse, status: number, json: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(json));
}

describe('request-scoped history cancellation through the real HTTP transport', () => {
  afterEach(() => vi.restoreAllMocks());
  for (const cached of [false, true]) for (const stage of ['runs-first', 'runs-page', 'results-first', 'results-page', 'retry-runs', 'retry-results'] as Stage[]) {
    it(`reports a ${stage.startsWith('runs') || stage === 'retry-runs' ? 'suite' : 'point'} failure promptly during ${stage}, cached history ${cached}`, async () => {
      const requestController = new AbortController();
      const failSuite = stage.startsWith('runs') || stage === 'retry-runs';
      let failedRead: ServerResponse | undefined, failRequested = false, historyClosed = false, historyCalls = 0;
      const abortPointOrSuite = () => {
        failRequested = true;
        if (failedRead && !failedRead.writableEnded) send(failedRead, 400, {});
      };
      const azure = await boundary((url, response) => {
        const path = url.pathname.toLowerCase();
        const list = (values: unknown[]) => send(response, 200, { value: values });
        if (path.endsWith('/suites')) return list([{ id: 10, name: 'Root', children: [{ id: 11, name: 'Child', children: [] }] }]);
        if ((failSuite && path.endsWith('/suites/11/testcases')) || (!failSuite && path.endsWith('/suites/10/points'))) {
          failedRead = response;
          if (failRequested) abortPointOrSuite();
          return;
        }
        if (path.endsWith('/testcases')) return list(path.includes('/suites/10/') ? [{ testCase: { id: 101 } }] : []);
        if (path.endsWith('/points')) return list([]);
        const isRuns = path.endsWith('/runs');
        historyCalls++;
        const skip = Number(url.searchParams.get('$skip'));
        if (isRuns && !stage.includes('runs')) return list([run]);
        if (isRuns && stage === 'runs-page' && skip === 0) return list([run]);
        if (!isRuns && stage === 'results-page' && skip === 0) return list([result]);
        if (stage.startsWith('retry')) {
          response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' });
          response.end('{}');
          // Let the adapter enter the retry wait before the independent suite/point read fails.
          setTimeout(abortPointOrSuite, 20);
          return;
        }
        response.once('close', () => { if (!response.writableEnded) historyClosed = true; });
        abortPointOrSuite();
      });
      const diagnostics = createViewReadDiagnostics('relations', 'history-cancellation', 'server', () => {});
      const http = createMatrixReadHttpClient(azure.transport, { signal: requestController.signal, diagnostics });
      const management = new AzureTestManagementAdapter(http, context, {
        runsPageSize: stage === 'runs-page' ? 1 : 1000, resultsPageSize: stage === 'results-page' ? 1 : 100
      });
      const cache = new InMemoryTestResultHistoryAdapter();
      const session = createMatrixReadSession({ testManagement: management, testCaseHydration: { hydrateTestCases: async () => new Map() },
        ...(cached ? { testResultHistory: cache.forContext('history-context') } : {}) }, { signal: requestController.signal, diagnostics });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const pending = loadTestCaseProjections({ planId: 1, rootSuiteId: 10 }, session);
        const promptFailure = Promise.race([pending, new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('history delayed the known suite/point failure')), 1000);
        })]);
        await expect(promptFailure).rejects.toThrow(failSuite ? 'TEST_CASES_HTTP_400' : 'POINTS_HTTP_400');
        expect(requestController.signal.aborted).toBe(false);
        if (!stage.startsWith('retry')) await vi.waitFor(() => expect(historyClosed).toBe(true));
        const calls = historyCalls;
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(historyCalls).toBe(calls);
        expect(calls).toBe(stage === 'runs-first' || stage === 'retry-runs' ? 1 : stage === 'results-page' ? 3 : 2);
      } finally {
        clearTimeout(timeout);
        requestController.abort();
        diagnostics.finish('complete');
        await azure.close();
      }
    });
  }

  it('does not abort another consumer or publish an aborted history into the shared cache', async () => {
    let resultCalls = 0, firstClosed = false;
    const azure = await boundary((url, response) => {
      if (url.pathname.toLowerCase().endsWith('/runs')) return send(response, 200, { value: [run] });
      resultCalls++;
      if (resultCalls === 1) response.once('close', () => { if (!response.writableEnded) firstClosed = true; });
      else send(response, 200, { value: [result] });
    });
    const first = new AbortController(), second = new AbortController();
    const cache = new InMemoryTestResultHistoryAdapter();
    const read = (signal: AbortSignal) => cache.forContext('shared-history').loadPlanResults(1, { signal,
      testManagement: new AzureTestManagementAdapter(createMatrixReadHttpClient(azure.transport, { signal }), context) });
    try {
      const cancelled = read(first.signal).catch(error => error);
      await vi.waitFor(() => expect(resultCalls).toBe(1));
      const survivor = await read(second.signal);
      first.abort();
      expect(await cancelled).toMatchObject({ name: 'AbortError' });
      expect(survivor.results[0].outcome).toBe('Passed');
      expect(second.signal.aborted).toBe(false);
      await vi.waitFor(() => expect(firstClosed).toBe(true));
      expect((await read(second.signal)).freshness.cacheUsed).toBe(true);
      expect(resultCalls).toBe(2);
    } finally { first.abort(); second.abort(); await azure.close(); }
  });
});
