import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAzureFixture } from '../../../tests/e2e/release-matrix-v3/azure-fixture.js';
import { loadActiveSetSnapshot } from '../../application/use-cases/load-active-set-snapshot.use-case.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { recordMatrixOutcome } from '../../application/use-cases/record-matrix-outcome.use-case.js';
import { buildRuntime } from './runtime.js';

const context = { organization: 'contract-org', project: 'contract-project' };
const target = { planId: 1, suiteId: 22, workItemId: 201, pointId: 22201, outcome: 'Passed' as const };
const isResultHistory = (url: string) => /\/runs\/\d+\/results$/i.test(new URL(url).pathname);
const isRunList = (url: string) => /\/runs$/i.test(new URL(url).pathname);

describe('shared history in the real runtime composition', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'azure-testops-history-'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  });
  afterEach(async () => { vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); });

  async function harness() {
    const azure = makeAzureFixture();
    const runtime = buildRuntime({ userPreferencesFilePath: path.join(directory, 'preferences.json'), httpClient: azure.client });
    await runtime.adoContext.setContext(context);
    await runtime.setRepository.create({ name: 'Release', planId: '1', rootSuiteId: '20', queryId: '00000000-0000-4000-8000-000000000001' }, { id: 'release' });
    const matching = () => loadActiveSetSnapshot({ setId: 'release' }, { ...runtime.ado.snapshotServices!(context, new AbortController().signal), setRepository: runtime.setRepository });
    const services = runtime.ado.matrixServices!(context);
    const matrix = () => loadReleaseMatrix(1, services, { versionSuiteIds: [20] });
    return { azure, runtime, services, matching, matrix };
  }

  it('reuses Zuordnung history in Matrix, normalizes equivalent contexts and expires without extending the source age', async () => {
    const f = await harness();
    const matching = await f.matching();
    expect(matching.freshness).toEqual({ sourceReadAt: '2026-10-15T10:00:00.000Z', cacheUsed: false });
    expect(f.azure.reads.filter(isResultHistory)).toHaveLength(1);
    vi.setSystemTime(new Date('2026-10-15T10:00:20Z'));
    const equivalentContext = { organization: ' https://dev.azure.com/contract-org/ ', project: ' contract-project ' };
    const matrix = await loadReleaseMatrix(1, f.runtime.ado.matrixServices!(equivalentContext), { versionSuiteIds: [20] });
    expect(matrix.freshness).toEqual({ ...matching.freshness, cacheUsed: true });
    expect(matrix.loadedAt).toBe('2026-10-15T10:00:20.000Z');
    expect(f.azure.reads.filter(isResultHistory)).toHaveLength(1);
    expect(f.azure.reads.filter(isRunList)).toHaveLength(2);
    vi.setSystemTime(new Date('2026-10-15T10:01:00Z'));
    const expired = await f.matrix();
    expect(expired.freshness).toEqual({ sourceReadAt: '2026-10-15T10:01:00.000Z', cacheUsed: false });
    expect(f.azure.reads.filter(isResultHistory)).toHaveLength(2);
  });

  it('invalidates warm data on successful local outcomes and confirms the write through live targeted reads', async () => {
    const f = await harness();
    await f.matching();
    expect((await f.matrix()).freshness?.cacheUsed).toBe(true);
    const beforeWrite = f.azure.reads.length;
    const written = await recordMatrixOutcome(target, { execution: f.services.execution, outcomeRead: f.services.outcomeRead! });
    const confirmationReads = f.azure.reads.slice(beforeWrite);
    expect(confirmationReads.some(url => /\/runs\/100$/i.test(new URL(url).pathname))).toBe(true);
    expect(confirmationReads.some(url => /\/runs\/100\/results\/1000$/i.test(new URL(url).pathname))).toBe(true);
    expect(confirmationReads.filter(isRunList)).toHaveLength(0);
    const reloaded = await f.matrix();
    expect(reloaded.freshness?.cacheUsed).toBe(false);
    expect(reloaded.projections.find(p => p.suiteId === 22 && p.workItemId === 201)?.lastRunId).toBe(written.runId);
    expect(reloaded.projections.find(p => p.suiteId === 22 && p.workItemId === 201)?.lastOutcome).toBe('Passed');
  });

  it('invalidates history even when an accepted write cannot be confirmed', async () => {
    const f = await harness();
    await f.matching();
    f.azure.control.hideNewResults = true;
    await expect(recordMatrixOutcome(target, { execution: f.services.execution, outcomeRead: f.services.outcomeRead! }))
      .rejects.toMatchObject({ code: 'MATRIX_RUN_UNCONFIRMED' });
    f.azure.control.hideNewResults = false;
    expect((await f.matrix()).freshness?.cacheUsed).toBe(false);
  });

  it.each([200, 500])('invalidates cached results for a reset transport attempt returning HTTP %s', async status => {
    const f = await harness();
    await f.matching();
    const patch = f.azure.client.patch.bind(f.azure.client);
    vi.spyOn(f.azure.client, 'patch').mockImplementation(async (url, body) => /\/points\//i.test(url) ? { status, json: {} } : patch(url, body));
    const reset = f.services.pointReset!.resetToActive(1, 22, 22201);
    if (status === 200) await reset;
    else await expect(reset).rejects.toThrow('POINT_RESET_HTTP_500');
    expect((await f.matrix()).freshness?.cacheUsed).toBe(false);
  });
});
