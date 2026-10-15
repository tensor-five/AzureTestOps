import { describe, expect, it, vi } from 'vitest';
import type { TestManagementReadPort } from '../../../application/ports/test-management.port.js';
import type { TestRun } from '../../../domain/test-management/test-run.js';
import type { TestResult } from '../../../domain/test-management/test-result.js';
import { InMemoryTestResultHistoryAdapter } from './in-memory-test-result-history.adapter.js';

const started = Date.parse('2026-10-15T10:00:00Z');
function completedRun(runId = 1, changes: Partial<TestRun> = {}): TestRun {
  return { runId, planId: 1, name: `Run ${runId}`, state: 'Completed', revision: 1,
    lastUpdatedDate: '2026-10-15T09:00:00Z', startedDate: null, completedDate: null,
    totalTests: 1, passedTests: 1, isAutomated: false, ...changes };
}
function result(runId = 1): TestResult {
  return { runId, resultId: runId * 100, workItemId: 1000 + runId, suiteId: 20, pointId: 2000 + runId,
    outcome: 'Passed', completedDate: '2026-10-15T09:00:00Z' };
}
function harness(options: ConstructorParameters<typeof InMemoryTestResultHistoryAdapter>[0] = {}) {
  let now = started;
  const cache = new InMemoryTestResultHistoryAdapter({ now: () => now, ...options });
  const runs = [completedRun()];
  const read: TestManagementReadPort = { loadSuiteTree: vi.fn(), listTestCasesInSuite: vi.fn(), loadPointsForSuite: vi.fn(),
    listRunsForPlan: vi.fn(async () => runs.map(run => ({ ...run }))), loadResultsForRun: vi.fn(async id => [result(id)]) };
  const load = (context = 'organization/project', planId = 1, signal?: AbortSignal) =>
    cache.forContext(context).loadPlanResults(planId, { testManagement: read, signal, concurrency: 1 });
  return { cache, runs, read, load, advance: (ms: number) => { now += ms; } };
}

describe('bounded shared completed-run history', () => {
  it('always enumerates runs and fetches only new, changed or running runs on a warm read', async () => {
    const f = harness();
    f.runs.push(completedRun(2), completedRun(3, { state: 'InProgress' }), completedRun(4));
    const first = await f.load();
    f.advance(10_000);
    f.runs[1].revision = 2;
    f.runs[1].lastUpdatedDate = '2026-10-15T10:00:01Z';
    f.runs.push(completedRun(5));
    vi.mocked(f.read.loadResultsForRun).mockClear();
    const warm = await f.load();
    expect(f.read.listRunsForPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.read.loadResultsForRun).mock.calls.map(call => call[0])).toEqual([2, 3, 5]);
    expect(warm.results.map(value => value.runId)).toEqual([1, 2, 3, 4, 5]);
    expect(first.freshness).toEqual({ sourceReadAt: new Date(started).toISOString(), cacheUsed: false });
    expect(warm.freshness).toEqual({ ...first.freshness, cacheUsed: true });
  });

  it('detects either change marker independently and never treats a running/aborted run as reusable', async () => {
    const f = harness();
    await f.load();
    f.runs[0].lastUpdatedDate = '2026-10-15T10:00:01Z';
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    f.runs[0].revision = 3;
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    for (const state of ['InProgress', 'Aborted', 'Waiting', '']) {
      f.runs[0].state = state;
      await f.load();
      expect((await f.load()).freshness.cacheUsed).toBe(false);
    }
  });

  it('expires after 60 seconds from the source fetch, including missing markers and frequent hits', async () => {
    const f = harness({ maxAgeMs: 900_000 });
    delete f.runs[0].revision;
    delete f.runs[0].lastUpdatedDate;
    await f.load();
    f.advance(30_000);
    await f.load();
    f.advance(29_999);
    expect((await f.load()).freshness.cacheUsed).toBe(true);
    f.advance(1);
    const refreshed = await f.load();
    expect(refreshed.freshness).toEqual({ sourceReadAt: new Date(started + 60_000).toISOString(), cacheUsed: false });
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(2);
    f.advance(-60_000);
    expect((await f.load()).freshness.cacheUsed).toBe(false);
  });

  it('isolates identical numeric IDs across contexts and plans', async () => {
    const f = harness();
    await f.load();
    await f.load('another/project');
    f.runs[0].planId = 2;
    await f.load('organization/project', 2);
    f.runs[0].planId = 1;
    expect((await f.load()).freshness.cacheUsed).toBe(true);
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(3);
  });

  it('refreshes an external outcome change without changed run markers at the hard source-age limit', async () => {
    const f = harness(), upstreamResult = result();
    vi.mocked(f.read.loadResultsForRun).mockImplementation(async () => [{ ...upstreamResult }]);
    const initial = await f.load();
    upstreamResult.outcome = 'Failed';
    f.advance(59_999);
    const stored = await f.load();
    expect(stored.results[0].outcome).toBe('Passed');
    expect(stored.freshness).toEqual({ ...initial.freshness, cacheUsed: true });
    f.advance(1);
    const refreshed = await f.load();
    expect(refreshed.results[0].outcome).toBe('Failed');
    expect(refreshed.freshness).toEqual({ sourceReadAt: new Date(started + 60_000).toISOString(), cacheUsed: false });
    expect(f.read.listRunsForPlan).toHaveBeenCalledTimes(3);
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(2);
  });

  it('does not publish staged data after any failed or aborted history read', async () => {
    const f = harness();
    f.runs.push(completedRun(2));
    vi.mocked(f.read.loadResultsForRun).mockImplementationOnce(async () => [result()]).mockRejectedValueOnce(new Error('second run failed'));
    await expect(f.load()).rejects.toThrow('second run failed');
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(4);

    const cancelled = harness(), controller = new AbortController();
    vi.mocked(cancelled.read.loadResultsForRun).mockImplementationOnce(async () => { controller.abort(); return [result()]; });
    await expect(cancelled.load(undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect((await cancelled.load()).freshness.cacheUsed).toBe(false);
  });

  it('never caches incomplete results or values from another run', async () => {
    const f = harness();
    f.runs[0].totalTests = 2;
    await f.load();
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    f.runs[0].totalTests = 1;
    vi.mocked(f.read.loadResultsForRun).mockResolvedValue([result(999)]);
    await f.load();
    expect((await f.load()).freshness.cacheUsed).toBe(false);
  });

  it.each(['InProgress', 'Pending', 'Paused', 'Aborted', ''])
    ('never reuses explicit result state %j even when the run claims completion', async state => {
      const f = harness();
      vi.mocked(f.read.loadResultsForRun).mockResolvedValue([{ ...result(), state }]);
      await f.load();
      expect((await f.load()).freshness.cacheUsed).toBe(false);
      expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(2);
      vi.mocked(f.read.loadResultsForRun).mockResolvedValue([{ ...result(), state: 'Completed' }]);
      await f.load();
      expect((await f.load()).freshness.cacheUsed).toBe(true);
    });

  it('fences older in-flight reads before/after writes and does not cache reads performed during a write', async () => {
    const f = harness();
    let release!: (values: TestResult[]) => void;
    vi.mocked(f.read.loadResultsForRun).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = f.load();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const finish = f.cache.beginWrite('organization/project', 1);
    release([result()]);
    await pending;
    await f.load();
    finish();
    finish();
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(3);
    expect((await f.load()).freshness.cacheUsed).toBe(true);
  });

  it('keeps independent consumers alive when one consumer cancels', async () => {
    const f = harness(), controller = new AbortController();
    let releaseFirst!: (values: TestResult[]) => void;
    vi.mocked(f.read.loadResultsForRun).mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }));
    const first = f.load(undefined, undefined, controller.signal).then(() => null, error => error);
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'));
    const second = await f.load();
    controller.abort();
    releaseFirst([result()]);
    expect(await first).toMatchObject({ name: 'AbortError' });
    expect(second.results).toEqual([result()]);
    expect((await f.load()).freshness.cacheUsed).toBe(true);
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(2);
  });

  it('does not return reusable cache data when the caller aborts during fresh run enumeration', async () => {
    const f = harness(), controller = new AbortController();
    await f.load();
    vi.mocked(f.read.listRunsForPlan).mockImplementationOnce(async (_planId, signal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return f.runs;
    });
    await expect(f.load(undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.read.loadResultsForRun).toHaveBeenCalledTimes(1);
  });

  it('keeps the write fence when a context is evicted and recreated during an active write', async () => {
    const f = harness({ maxContexts: 1 });
    await f.load('one');
    const finish = f.cache.beginWrite('one', 1);
    await f.load('two');
    let release!: (values: TestResult[]) => void;
    vi.mocked(f.read.loadResultsForRun).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const duringWrite = f.load('one');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    finish();
    release([result()]);
    await duringWrite;
    expect((await f.load('one')).freshness.cacheUsed).toBe(false);
  });

  it('bounds retained entries/results/contexts and protects stored values from caller mutation', async () => {
    for (const limit of [{ maxEntries: 1 }, { maxResults: 1 }]) {
      const f = harness(limit);
      f.runs.push(completedRun(2));
      await f.load();
      f.runs.splice(1, 1);
      expect((await f.load()).freshness.cacheUsed).toBe(false);
    }
    const f = harness({ maxContexts: 1 });
    await f.load('one');
    await f.load('two');
    expect((await f.load('one')).freshness.cacheUsed).toBe(false);
    const callerValue = await f.load('one');
    callerValue.results[0].outcome = 'Failed';
    expect((await f.load('one')).results[0].outcome).toBe('Passed');
  });

  it('removes deleted runs and counts fetched/reused history without logging payloads', async () => {
    const f = harness();
    const addCount = vi.fn();
    const history = f.cache.forContext('organization/project', { addCount } as never);
    await history.loadPlanResults(1, { testManagement: f.read });
    f.runs.splice(0);
    await f.load();
    f.runs.push(completedRun());
    expect((await f.load()).freshness.cacheUsed).toBe(false);
    expect(addCount.mock.calls).toEqual([['historyRunsReused', 0], ['historyRunsFetched', 1]]);
  });
});
