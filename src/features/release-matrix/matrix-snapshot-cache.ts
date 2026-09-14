import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
export type CachedMatrixSnapshot = {setId: string; snapshot: MatrixSnapshot; readStartedAt: number; loadedAt: number};
const MAX_AGE_MS = 60_000;
const MAX_ENTRIES = 16;
const caches = new WeakMap<ReleaseMatrixClientPort, Map<string, CachedMatrixSnapshot>>();
/** Bounded, transient cache. Explicit refresh bypasses it; no data goes to user preferences. */
export function matrixSnapshotCache(port: ReleaseMatrixClientPort) {
  let entries = caches.get(port);
  if (!entries) { entries = new Map(); caches.set(port, entries); }
  const cache = entries;
  return {
    get(key: string, now = Date.now()): CachedMatrixSnapshot | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      if (now - entry.loadedAt >= MAX_AGE_MS || now < entry.loadedAt) { cache.delete(key); return undefined; }
      cache.delete(key); cache.set(key, entry);
      return entry;
    },
    set(key: string, value: CachedMatrixSnapshot) {
      cache.delete(key); cache.set(key, value);
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    },
    invalidate(key: string) { cache.delete(key); },
    invalidateScope(setId: string, planId: number, contextIdentity: string) {
      for (const [key, entry] of cache) {
        if (entry.setId === setId && entry.snapshot.planId === planId && entry.snapshot.contextIdentity === contextIdentity)
          cache.delete(key);
      }
    },
  };
}
