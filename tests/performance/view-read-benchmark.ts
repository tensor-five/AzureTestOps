import { writeFile } from 'node:fs/promises';
import { makeAzureFixture } from '../e2e/release-matrix-v3/azure-fixture.js';
import { AzureTestManagementAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-management.adapter.js';
import { AzureTestCatalogAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-catalog.adapter.js';
import { AzureTestOutcomeReadAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-outcome-read.adapter.js';
import { AzureWorkItemHydrationAdapter } from '../../src/adapters/azure-devops/work-items/azure-work-item-hydration.adapter.js';
import { WorkItemBackedTestCaseHydrationAdapter } from '../../src/adapters/azure-devops/test-management/work-item-backed-test-case-hydration.adapter.js';
import { loadReleaseMatrix } from '../../src/application/use-cases/load-release-matrix.use-case.js';
import { loadTestCaseProjections } from '../../src/application/use-cases/load-test-case-projections.use-case.js';
import { InMemoryTestResultHistoryAdapter } from '../../src/adapters/persistence/memory/in-memory-test-result-history.adapter.js';
const mode = process.env.VIEW_BENCHMARK_MODE ?? 'after';
const context = {organization: 'contract-org', project: 'contract-project'};
const samples = [];
for (const history of mode === 'shared-history' ? [] : [10, 500]) for (const suiteCount of [23, 103]) for (const view of ['matrix', 'matching']) {
  for (let repeat = 0; repeat < 3; repeat++) {
    const azure = makeAzureFixture();
    // Avoid ambiguous fixtures in the normal-path scaling measurement; covered separately by regression tests.
    for (const suite of Object.keys(azure.membership)) azure.membership[Number(suite)] = azure.membership[Number(suite)].filter(id => id !== 302 && id !== 304);
    while (azure.suites.length < suiteCount) {
      const id = 10000 + azure.suites.length;
      azure.suites.push({id, name: `Unselected suite ${id}`, parentSuite: {id: 50}, suiteType: 'StaticTestSuite', queryString: undefined});
      azure.membership[id] = [999];
    }
    while (azure.runs.length < history) {
      const id = 1000 + azure.runs.length;
      azure.runs.push({id, plan:{id:1}, name:`History ${id}`, state:'Completed', isAutomated:false});
      azure.results.unshift({...azure.results[0], id, testRun:{id}, completedDate:'2025-01-01T00:00:00Z'});
    }
    let requests = 0;
    const operations: Record<string, number> = {};
    const original = azure.client.get.bind(azure.client);
    azure.client.get = async url => {
      requests++;
      const path = new URL(url).pathname.replace(/\d+/g, ':id'); operations[path] = (operations[path] ?? 0) + 1;
      await new Promise(resolve => setTimeout(resolve, 15));
      return original(url);
    };
    const deps = {testManagement: new AzureTestManagementAdapter(azure.client,context), testCatalog: new AzureTestCatalogAdapter(azure.client,context),
      outcomeRead: new AzureTestOutcomeReadAdapter(azure.client,context),
      testCaseHydration: new WorkItemBackedTestCaseHydrationAdapter(new AzureWorkItemHydrationAdapter(azure.client,context))};
    const started = performance.now();
    if (view === 'matrix') await loadReleaseMatrix(1,deps, {versionSuiteIds:[20,30]} as Parameters<typeof loadReleaseMatrix>[2]);
    else await loadTestCaseProjections({planId:1,rootSuiteId:20},deps);
    samples.push({view,history,suiteCount,repeat,requests,elapsedMs:Math.round(performance.now()-started),operations});
  }
}

// Same synthetic Azure boundary, now exercising both views against one shared runtime history.
// VIEW_BENCHMARK_MODE=shared-history avoids the older isolated-read scenarios above.
const sharedSamples = [];
if (mode === 'shared-history') for (const history of [10, 500, 965]) {
  const azure = makeAzureFixture();
  while (azure.runs.length < history) {
    const id = 1000 + azure.runs.length;
    azure.runs.push({ id, plan: { id: 1 }, name: `History ${id}`, state: 'Completed', isAutomated: false });
    azure.results.unshift({ ...azure.results[0], id, testRun: { id }, completedDate: '2025-01-01T00:00:00Z' });
  }
  let requests = 0, resultRequests = 0, cacheTime = Date.now();
  const original = azure.client.get.bind(azure.client);
  azure.client.get = async url => {
    requests++;
    if (/\/runs\/\d+\/results$/i.test(new URL(url).pathname)) resultRequests++;
    await new Promise(resolve => setTimeout(resolve, 15));
    return original(url);
  };
  const historyCache = new InMemoryTestResultHistoryAdapter({ now: () => cacheTime });
  const deps = { testManagement: new AzureTestManagementAdapter(azure.client, context), testCatalog: new AzureTestCatalogAdapter(azure.client, context),
    testResultHistory: historyCache.forContext('benchmark-context'),
    testCaseHydration: new WorkItemBackedTestCaseHydrationAdapter(new AzureWorkItemHydrationAdapter(azure.client, context)) };
  for (const phase of ['cold-matching', 'warm-matrix', 'warm-matching', 'changed-matrix', 'expired-matrix']) {
    if (phase === 'changed-matrix') {
      azure.runs[0].revision = 2;
      const id = 100000;
      azure.runs.push({ id, plan: { id: 1 }, name: 'Newly completed run', state: 'Completed', isAutomated: false });
      azure.results.push({ ...azure.results[0], id, testRun: { id } });
    }
    if (phase === 'expired-matrix') cacheTime += 60_000;
    requests = 0; resultRequests = 0;
    const started = performance.now();
    const loaded = phase.endsWith('matching')
      ? await loadTestCaseProjections({ planId: 1, rootSuiteId: 20 }, deps)
      : await loadReleaseMatrix(1, deps, { versionSuiteIds: [20, 30] });
    sharedSamples.push({ history, phase, requests, resultRequests, cacheUsed: loaded.freshness?.cacheUsed,
      elapsedMs: Math.round(performance.now() - started) });
  }
}
await writeFile(`/tmp/view-read-${mode}.json`, JSON.stringify({mode, baselineCommit:'f6cc4f21b1533f9476688402e76ce01db8bad5bb',delayMs:15,repeats:mode === 'shared-history' ? 1 : 3,samples,sharedSamples},null,2)+'\n');
