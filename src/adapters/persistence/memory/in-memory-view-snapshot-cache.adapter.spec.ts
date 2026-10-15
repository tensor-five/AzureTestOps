import { describe, expect, it } from 'vitest';
import type { ActiveSetSnapshot } from '../../../application/dto/active-set-snapshot.dto.js';
import type { MatrixSnapshot } from '../../../application/dto/release-matrix.dto.js';
import type { SnapshotScope } from '../../../application/ports/view-snapshot-cache.port.js';
import { InMemoryViewSnapshotCacheAdapter } from './in-memory-view-snapshot-cache.adapter.js';

const now = Date.parse('2026-10-15T10:00:00Z');
const scope: SnapshotScope<'matching'> = { view: 'matching', contextIdentity: 'org/project', planId: 1, identity: 'set/root/query' };
const snapshot = (): ActiveSetSnapshot => ({ set: { id: 'set', name: 'Set', planId: '1', rootSuiteId: '10', queryId: 'query' },
  suiteTree: { id: 10, name: 'Root', path: 'Root', parentSuiteId: null, children: [] }, projections: [], workItemsFromQuery: [],
  loadedAt: new Date(now).toISOString(), freshness: { sourceReadAt: new Date(now - 40_000).toISOString(), cacheUsed: false } });

describe('bounded complete-view preview cache', () => {
  it('returns an independent preview without advancing source age or successful completion time', () => {
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => now });
    const value = snapshot();
    cache.beginRead(scope).store(value);
    const cached = cache.get(scope)!;
    expect(cached).toEqual({ ...value, freshness: { ...value.freshness!, cacheUsed: true } });
    cached.set.name = 'Edited by consumer';
    expect(cache.get(scope)!.set.name).toBe('Set');
    expect(value.freshness!.cacheUsed).toBe(false);
  });

  it('expires at 30 minutes from the oldest source rather than repeated preview hits or loadedAt', () => {
    let clock = now;
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => clock, maxAgeMs: 60 * 60_000 });
    cache.beginRead(scope).store(snapshot());
    clock += 29 * 60_000;
    expect(cache.get(scope)).not.toBeNull();
    clock += 20_000;
    expect(cache.get(scope)).toBeNull();
    cache.beginRead(scope).store(snapshot());
    expect(cache.get(scope)).toBeNull();
  });

  it('isolates both views, contexts, plan IDs and full read identities', () => {
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => now });
    cache.beginRead(scope).store(snapshot());
    expect(cache.get({ ...scope, contextIdentity: 'other/project' })).toBeNull();
    expect(cache.get({ ...scope, planId: 2 })).toBeNull();
    expect(cache.get({ ...scope, identity: 'set/another-root/query' })).toBeNull();
    expect(cache.get({ ...scope, view: 'matrix' })).toBeNull();
  });

  it('bounds entries by LRU and refuses snapshots beyond its byte budget', () => {
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => now, maxEntries: 2 });
    const second = { ...scope, identity: 'second' }, third = { ...scope, identity: 'third' };
    cache.beginRead(scope).store(snapshot()); cache.beginRead(second).store(snapshot());
    cache.get(scope);
    cache.beginRead(third).store(snapshot());
    expect(cache.get(second)).toBeNull(); expect(cache.get(scope)).not.toBeNull();
    const tooSmall = new InMemoryViewSnapshotCacheAdapter({ now: () => now, maxBytes: Buffer.byteLength(JSON.stringify(snapshot())) - 1 });
    tooSmall.beginRead(scope).store(snapshot());
    expect(tooSmall.get(scope)).toBeNull();
    const boundedBytes = new InMemoryViewSnapshotCacheAdapter({ now: () => now, maxBytes: Math.floor(Buffer.byteLength(JSON.stringify(snapshot())) * 1.6) });
    boundedBytes.beginRead(scope).store(snapshot()); boundedBytes.beginRead(second).store(snapshot());
    expect(boundedBytes.get(scope)).toBeNull(); expect(boundedBytes.get(second)).not.toBeNull();
  });

  it('never stores aborted reads and rejects an aborted preview consumer', () => {
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => now }), controller = new AbortController();
    const read = cache.beginRead(scope);
    controller.abort();
    read.store(snapshot(), controller.signal);
    expect(cache.get(scope)).toBeNull();
    cache.beginRead(scope).store(snapshot());
    expect(() => cache.get(scope, controller.signal)).toThrow();
  });

  it('invalidates both views before/after writes and fences older or concurrent readers across eviction', () => {
    const cache = new InMemoryViewSnapshotCacheAdapter({ now: () => now, maxEntries: 1 });
    const matrixScope: SnapshotScope<'matrix'> = { ...scope, view: 'matrix' };
    const matrix: MatrixSnapshot = { planId: 1, suites: [], projections: [], pointCounts: {}, contextIdentity: scope.contextIdentity,
      loadedAt: snapshot().loadedAt, freshness: snapshot().freshness };
    const oldRead = cache.beginRead(scope);
    cache.beginRead(scope).store(snapshot());
    const finish = cache.beginWrite({ contextIdentity: scope.contextIdentity, planId: 1 });
    expect(cache.get(scope)).toBeNull();
    const during = cache.beginRead(matrixScope);
    during.store(matrix);
    expect(cache.get(matrixScope)).toBeNull();
    cache.beginRead({ ...scope, contextIdentity: 'other/project' }).store(snapshot());
    finish(); finish();
    oldRead.store(snapshot()); during.store(matrix);
    expect(cache.get(scope)).toBeNull(); expect(cache.get(matrixScope)).toBeNull();
    cache.beginRead(scope).store(snapshot());
    expect(cache.get(scope)).not.toBeNull();
    cache.beginWrite()();
    expect(cache.get(scope)).toBeNull();
  });
});
