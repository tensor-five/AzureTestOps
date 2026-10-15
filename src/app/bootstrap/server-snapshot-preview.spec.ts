import { createServer as createNetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAzureFixture } from '../../../tests/e2e/release-matrix-v3/azure-fixture.js';
import { buildRuntime } from '../composition/runtime.js';
import { createHttpServer } from './http-server.js';
import { InMemoryViewSnapshotCacheAdapter } from '../../adapters/persistence/memory/in-memory-view-snapshot-cache.adapter.js';
import { viewSnapshotScope } from './routes/view-snapshot-scope.js';
import type { ActiveSetSnapshot } from '../../application/dto/active-set-snapshot.dto.js';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';

const context = { organization: 'global-org', project: 'global-project' };
const matchingPath = '/phase2/active-set/snapshot/stream?setId=set';
const matrixPath = '/phase2/sets/set/release-matrix?versions=[20,30]';
const matrixOnlyPath = `${matrixPath}&cache=only`;
type Frame = { event: string; data: { snapshot?: ActiveSetSnapshot; message?: string } };
const frames = (text: string): Frame[] => text.split('\n\n').filter(value => value.startsWith('event: ')).map(value => {
  const [event, data] = value.split('\n');
  return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
});
const cleanup: Array<() => Promise<void>> = [];
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.restoreAllMocks(); });

async function harness() {
  const directory = await mkdtemp(path.join(tmpdir(), 'snapshot-preview-'));
  const azure = makeAzureFixture();
  const reads: string[] = [];
  const gate: { beforeGet?: (url: string, signal?: AbortSignal) => Promise<void> } = {};
  const runtime = buildRuntime({ userPreferencesFilePath: path.join(directory, 'preferences.json'), httpClient: {
    get: async (url, options) => { reads.push(url); await gate.beforeGet?.(url, options?.signal); options?.signal?.throwIfAborted(); return azure.client.get(url); },
    post: (url, body) => azure.client.post(url, body), patch: (url, body) => azure.client.patch(url, body)
  } });
  await runtime.adoContext.setContext(context);
  const set = await runtime.setRepository.create({ name: 'Set', planId: '1', rootSuiteId: '20', queryId: 'query' }, { id: 'set' });
  await runtime.setRepository.setActiveId(set.id);
  const cache = new InMemoryViewSnapshotCacheAdapter();
  const reserve = createNetServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const server = createHttpServer({ port, snapshotCache: cache, deps: runtime });
  const origin = `http://127.0.0.1:${port}`;
  const html = await (await fetch(origin)).text();
  const csrf = html.match(/name="ado-csrf-token" content="([^"]+)"/)![1];
  const request = (url: string, init: RequestInit = {}) => fetch(origin + url, { ...init,
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json', 'x-ado-csrf-token': csrf, ...init.headers }
  });
  cleanup.push(async () => { gate.beforeGet = undefined; await server.close(); await rm(directory, { recursive: true, force: true }); });
  const matching = async () => frames(await (await request(matchingPath)).text());
  const matrix = async () => (await (await request(matrixPath)).json()) as MatrixSnapshot;
  const only = async (url = matrixOnlyPath) => (await (await request(url)).json()) as MatrixSnapshot | null;
  const matchingScope = () => viewSnapshotScope('matching', `https://dev.azure.com/${context.organization}/${context.project}`, set);
  return { azure, runtime, set, cache, request, matching, matrix, only, reads, gate, matchingScope };
}
function holdTree(f: Awaited<ReturnType<typeof harness>>) {
  let release!: () => void, entered = false;
  f.gate.beforeGet = async (url, signal) => {
    if (entered || !url.includes('$asTreeView')) return;
    entered = true;
    await new Promise<void>((resolve, reject) => {
      release = resolve;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  return { release: () => release?.(), entered: () => entered };
}

describe('complete snapshot previews across real HTTP requests', () => {
  it('sends the cached matching snapshot before progress while the authoritative Azure read is still held', async () => {
    const f = await harness(), warmed = await f.matching();
    const first = warmed.find(frame => frame.event === 'result')!.data.snapshot!;
    const held = holdTree(f);
    const response = await f.request(matchingPath), reader = response.body!.getReader();
    let text = '';
    try {
      while (!text.includes('event: cached\n')) text += new TextDecoder().decode((await reader.read()).value);
      const preview = frames(text)[0];
      expect(preview.event).toBe('cached');
      expect(preview.data.snapshot!.loadedAt).toBe(first.loadedAt);
      expect(preview.data.snapshot!.freshness).toEqual({ ...first.freshness!, cacheUsed: true });
      await vi.waitFor(() => expect(held.entered()).toBe(true));
      expect(text).not.toContain('event: result\n');
      held.release();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); }
      expect(frames(text).map(frame => frame.event).filter(event => event !== 'progress')).toEqual(['cached', 'result']);
      expect(text.indexOf('event: cached')).toBeLessThan(text.indexOf('event: progress'));
    } finally { held.release(); await reader.cancel(); }
  });

  it('returns normalized matrix previews or null without calling any Azure service', async () => {
    const f = await harness();
    expect(await f.only()).toBeNull(); expect(f.reads).toHaveLength(0);
    const loaded = await f.matrix(), before = f.reads.length;
    expect(await f.only('/phase2/sets/set/release-matrix?versions=[30,20,20]&cache=only'))
      .toEqual({ ...loaded, freshness: { ...loaded.freshness!, cacheUsed: true } });
    expect(await f.only('/phase2/sets/set/release-matrix?versions=[20]&flatVersions=[30]&cache=only')).toBeNull();
    expect(await f.only('/phase2/sets/set/release-matrix?versions=[]&cache=only')).toBeNull();
    expect(f.reads).toHaveLength(before);
    await f.runtime.setRepository.update('set', { rootSuiteId: '30' });
    expect(await f.only()).toBeNull();
    expect(f.reads).toHaveLength(before);
  });

  it('uses the global matching context and set-bound matrix context and isolates changed set metadata', async () => {
    const f = await harness();
    await f.runtime.setRepository.update('set', { organization: 'set-org', project: 'set-project' });
    await f.matching(); await f.matrix();
    expect((await f.only())!.contextIdentity).toBe('https://dev.azure.com/set-org/set-project');
    await f.runtime.adoContext.setContext({ organization: 'other-global', project: 'other-project' });
    expect((await f.only())!.contextIdentity).toBe('https://dev.azure.com/set-org/set-project');
    expect((await f.matching()).some(frame => frame.event === 'cached')).toBe(false);
    await f.runtime.setRepository.update('set', { organization: 'changed-set-org' });
    expect(await f.only()).toBeNull();
    expect((await f.matching()).some(frame => frame.event === 'cached')).toBe(false);
  });

  it('retains the last complete preview after a fresh failure and never stores an aborted initial stream', async () => {
    const f = await harness();
    await f.matching();
    const before = f.cache.get(f.matchingScope())!;
    f.azure.control.failTree = true;
    const failed = await f.matching();
    expect(failed.filter(frame => frame.event !== 'progress').map(frame => frame.event)).toEqual(['cached', 'error']);
    expect(f.cache.get(f.matchingScope())!.loadedAt).toBe(before.loadedAt);
    f.azure.control.failTree = false;
    f.cache.beginWrite()();
    const held = holdTree(f), controller = new AbortController();
    const response = await f.request(matchingPath, { signal: controller.signal });
    await vi.waitFor(() => expect(held.entered()).toBe(true));
    controller.abort(); held.release();
    await response.body!.cancel().catch(() => {});
    await vi.waitFor(() => expect(f.cache.get(f.matchingScope())).toBeNull());
  });

  it('keeps an independent consumer and its completed cached snapshot when another stream aborts', async () => {
    const f = await harness(), held = holdTree(f), controller = new AbortController();
    const first = await f.request(matchingPath, { signal: controller.signal });
    await vi.waitFor(() => expect(held.entered()).toBe(true));
    const survivor = (await f.matching()).find(frame => frame.event === 'result')!.data.snapshot!;
    controller.abort(); held.release();
    await first.body!.cancel().catch(() => {});
    expect(f.cache.get(f.matchingScope())!.loadedAt).toBe(survivor.loadedAt);
    expect(f.cache.get(f.matchingScope())!.freshness!.sourceReadAt).toBe(survivor.freshness!.sourceReadAt);
  });

  it('does not replace a complete matrix preview with a failed fresh matrix read', async () => {
    const f = await harness(), loaded = await f.matrix();
    f.azure.control.failTree = true;
    expect((await f.request(matrixPath)).status).toBe(500);
    const before = f.reads.length;
    expect((await f.only())!.loadedAt).toBe(loaded.loadedAt);
    expect(f.reads).toHaveLength(before);
  });

  it.each(['Passed', 'ResetToActive'] as const)('invalidates both previews for an unconfirmed %s attempt', async outcome => {
    const f = await harness();
    await f.matching(); const matrix = await f.matrix();
    f.azure.control.failAfterCreate = true;
    const response = await f.request('/phase2/sets/set/release-matrix/outcomes', { method: 'POST', body: JSON.stringify({
      planId: 1, suiteId: 22, workItemId: 201, pointId: 22201, contextIdentity: matrix.contextIdentity, outcome
    }) });
    expect(response.status).toBe(500);
    expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
  });

  it('invalidates both previews after a successful confirmed outcome', async () => {
    const f = await harness(); await f.matching(); const matrix = await f.matrix();
    const response = await f.request('/phase2/sets/set/release-matrix/outcomes', { method: 'POST', body: JSON.stringify({
      planId: 1, suiteId: 22, workItemId: 201, pointId: 22201, contextIdentity: matrix.contextIdentity, outcome: 'Passed'
    }) });
    expect(response.status).toBe(200);
    expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
  });

  it('invalidates both previews after a successful confirmed reset', async () => {
    const f = await harness(); await f.matching(); const matrix = await f.matrix();
    let reset = false;
    const get = f.azure.client.get.bind(f.azure.client), patch = f.azure.client.patch.bind(f.azure.client);
    f.azure.client.get = async url => {
      const response = await get(url);
      if (!reset || !/\/points\?/i.test(url)) return response;
      const body = response.json as { value: Array<Record<string, unknown>> };
      return { ...response, json: { ...body, value: body.value.map(point => point.id === 22201
        ? { ...point, state: 'Ready', outcome: 'Unspecified', lastTestRun: { id: 0 }, lastResult: { id: 0 } } : point) } };
    };
    f.azure.client.patch = async (url, body) => {
      if (!/\/points\/22201\?/i.test(url)) return patch(url, body);
      reset = true;
      return { status: 200, json: {} };
    };
    const response = await f.request('/phase2/sets/set/release-matrix/outcomes', { method: 'POST', body: JSON.stringify({
      planId: 1, suiteId: 22, workItemId: 201, pointId: 22201, contextIdentity: matrix.contextIdentity, outcome: 'ResetToActive'
    }) });
    expect(response.status).toBe(200);
    expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
  });

  it.each(['POST', 'DELETE'] as const)('fences old in-flight previews and all views around failed relation %s attempts', async method => {
    const f = await harness(); await f.matching(); await f.matrix();
    const held = holdTree(f), pendingRead = f.matching();
    await vi.waitFor(() => expect(held.entered()).toBe(true));
    let rejectWrite!: (error: Error) => void;
    const write = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectWrite = reject; }));
    f.runtime.ado.relations = async () => ({ addRelation: write, removeRelation: write });
    const pendingWrite = f.request('/phase2/relations', { method, body: JSON.stringify({ sourceId: 201, targetId: 501 }) });
    try {
      await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
      expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
      await f.matrix();
      rejectWrite(new Error('write could not be confirmed'));
      expect((await pendingWrite).status).toBe(500);
      held.release(); await pendingRead;
      expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
    } finally { held.release(); rejectWrite?.(new Error('cleanup')); await pendingRead; }
  });

  it('invalidates both views after a successful relation write', async () => {
    const f = await harness(); await f.matching(); await f.matrix();
    f.runtime.ado.relations = async () => ({ addRelation: async () => {}, removeRelation: async () => {} });
    expect((await f.request('/phase2/relations', { method: 'POST', body: JSON.stringify({ sourceId: 201, targetId: 501 }) })).status).toBe(200);
    expect(await f.only()).toBeNull(); expect(f.cache.get(f.matchingScope())).toBeNull();
  });
});
