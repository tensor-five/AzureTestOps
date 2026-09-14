import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resetActiveServices } from '../fixtures/reset-active.js';
import { recordMatrixOutcome } from '../../src/application/use-cases/record-matrix-outcome.use-case.js';
import { resetMatrixPoint } from '../../src/application/use-cases/reset-matrix-point.use-case.js';
import { loadReleaseMatrix } from '../../src/application/use-cases/load-release-matrix.use-case.js';

// Test harness only: fixed transport delay isolates request scaling from real Azure variance.
const mode = process.env.MATRIX_BENCHMARK_MODE ?? 'after';
const delayMs = 15;
const samples = [];
for (const [suiteCount, historyRuns] of [[20, 10], [100, 10], [20, 500], [100, 500]]) {
  for (const action of ['Failed', 'ResetToActive'] as const) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const {azure, services} = resetActiveServices();
      while (azure.suites.length < suiteCount) {
        const id = 1000 + azure.suites.length;
        azure.suites.push({id, name: `Benchmark suite ${id}`, parentSuite: {id: 1}, suiteType: 'StaticTestSuite', queryString: undefined});
        azure.membership[id] = [101];
      }
      while (azure.runs.length < historyRuns) {
        const id = 10000 + azure.runs.length;
        azure.runs.push({id, plan: {id: 1}, name: `Historical run ${id}`, state: 'Completed', isAutomated: false});
        azure.results.push({id, testRun: {id}, testSuite: {id: 21}, testCase: {id: 201}, testPoint: {id: 21201},
          outcome: 'Failed', state: 'Completed', completedDate: '2025-01-01T00:00:00Z'});
      }
      let requestCount = 0, inFlight = 0, maxConcurrent = 0;
      const requests: Record<string, number> = {};
      for (const method of ['get', 'post', 'patch'] as const) {
        const original = azure.client[method].bind(azure.client) as (url: string, body?: unknown) => Promise<unknown>;
        azure.client[method] = (async (url: string, body?: unknown) => {
          requestCount++; inFlight++; maxConcurrent = Math.max(maxConcurrent, inFlight);
          const path = new URL(url).pathname.replace(/\d+/g, ':id');
          requests[`${method.toUpperCase()} ${path}`] = (requests[`${method.toUpperCase()} ${path}`] ?? 0) + 1;
          try { await new Promise(resolve => setTimeout(resolve, delayMs)); return await original(url, body); }
          finally { inFlight--; }
        }) as typeof azure.client[typeof method];
      }
      const started = performance.now();
      const target = {planId: 1, suiteId: 21, workItemId: 201, pointId: 21201};
      if (action === 'ResetToActive') await resetMatrixPoint({...target, outcome: action}, services);
      else await recordMatrixOutcome({...target, outcome: action}, services);
      const confirmationMs = performance.now() - started;
      const confirmationRequests = requestCount;
      // This is the existing UI's post-confirmation reload, measured separately from the write response.
      if (mode === 'before') await loadReleaseMatrix(1, services);
      samples.push({suiteCount, historyRuns, action, repeat, confirmationRequests, requests: requestCount,
        confirmationMs: Math.round(confirmationMs), totalMs: Math.round(performance.now() - started), maxConcurrent, endpoints: requests});
    }
  }
}
const output = {mode, baselineCommit: '28119a49f387d20c357dde05b26bd6e28fe4318d', delayMs, repeats: 3,
  measuredAt: new Date().toISOString(), environment: `Node ${process.version} ${process.platform}/${process.arch}`, samples};
await writeFile(process.env.MATRIX_BENCHMARK_OUTPUT ?? `/tmp/matrix-status-${mode}.json`, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(samples.map(({endpoints: _endpoints, ...sample}) => sample)));
