import type { SnapshotScope, SnapshotWriteScope, ViewSnapshotCachePort, ViewSnapshots } from '../../../application/ports/view-snapshot-cache.port.js';

type Entry = { scope: SnapshotScope; data: Buffer; sourceReadAt: number; bytes: number };
type Options = { now?: () => number; maxAgeMs?: number; maxEntries?: number; maxBytes?: number };

/** Complete server-side previews bounded by source age, entry count and serialized bytes. */
export class InMemoryViewSnapshotCacheAdapter implements ViewSnapshotCachePort {
  private readonly entries = new Map<string, Entry>();
  private readonly writes = new Set<SnapshotWriteScope>();
  private generation = 0;
  private bytes = 0;
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  public constructor(options: Options = {}) {
    this.now = options.now ?? Date.now;
    this.maxAgeMs = Math.min(30 * 60_000, Math.max(0, options.maxAgeMs ?? 30 * 60_000));
    this.maxEntries = Math.min(16, Math.max(0, options.maxEntries ?? 16));
    this.maxBytes = Math.min(32 * 1024 * 1024, Math.max(0, options.maxBytes ?? 32 * 1024 * 1024));
  }

  public get<K extends keyof ViewSnapshots>(scope: SnapshotScope<K>, signal?: AbortSignal): ViewSnapshots[K] | null {
    signal?.throwIfAborted();
    this.prune();
    if (this.blocked(scope)) return null;
    const key = scopeKey(scope), entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    const snapshot = JSON.parse(entry.data.toString('utf8')) as ViewSnapshots[K];
    return { ...snapshot, freshness: { sourceReadAt: new Date(entry.sourceReadAt).toISOString(), cacheUsed: true } };
  }

  public beginRead<K extends keyof ViewSnapshots>(scope: SnapshotScope<K>) {
    const generation = this.generation;
    return { store: (snapshot: ViewSnapshots[K], signal?: AbortSignal): void => {
      if (signal?.aborted || generation !== this.generation || this.blocked(scope)) return;
      const sourceReadAt = Date.parse(snapshot.freshness?.sourceReadAt ?? snapshot.loadedAt ?? '');
      const now = this.now();
      if (!Number.isFinite(sourceReadAt) || now < sourceReadAt || now - sourceReadAt >= this.maxAgeMs) return;
      const data = Buffer.from(JSON.stringify(snapshot), 'utf8');
      const key = scopeKey(scope);
      const bytes = data.byteLength + Buffer.byteLength(key, 'utf8');
      if (this.maxEntries === 0 || bytes > this.maxBytes) return;
      this.prune();
      this.remove(key);
      this.entries.set(key, { scope: { ...scope }, data, sourceReadAt, bytes });
      this.bytes += bytes;
      while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) this.remove(this.entries.keys().next().value!);
    } };
  }

  public beginWrite(scope: SnapshotWriteScope = {}): () => void {
    const fence = { ...scope };
    this.generation++;
    this.writes.add(fence);
    this.invalidate(fence);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.generation++;
      this.invalidate(fence);
      this.writes.delete(fence);
    };
  }

  private blocked(scope: SnapshotScope): boolean { return [...this.writes].some(write => matches(scope, write)); }
  private invalidate(write: SnapshotWriteScope): void {
    for (const [key, entry] of this.entries) if (matches(entry.scope, write)) this.remove(key);
  }
  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries)
      if (now < entry.sourceReadAt || now - entry.sourceReadAt >= this.maxAgeMs) this.remove(key);
  }
  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) { this.bytes -= entry.bytes; this.entries.delete(key); }
  }
}

function scopeKey(scope: SnapshotScope): string { return JSON.stringify([scope.view, scope.contextIdentity, scope.planId, scope.identity]); }
function matches(scope: SnapshotScope, write: SnapshotWriteScope): boolean {
  return (write.contextIdentity === undefined || write.contextIdentity === scope.contextIdentity)
    && (write.planId === undefined || write.planId === scope.planId);
}
