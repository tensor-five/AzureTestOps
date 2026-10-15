import type { ActiveSetSnapshot } from '../dto/active-set-snapshot.dto.js';
import type { MatrixSnapshot } from '../dto/release-matrix.dto.js';

export type ViewSnapshots = { matching: ActiveSetSnapshot; matrix: MatrixSnapshot };
export type SnapshotScope<K extends keyof ViewSnapshots = keyof ViewSnapshots> = {
  view: K;
  contextIdentity: string;
  planId: number;
  /** Stable complete read configuration, supplied by the HTTP composition. */
  identity: string;
};
export type SnapshotWriteScope = { contextIdentity?: string; planId?: number };

/** Transient previews only: callers must always continue with a fresh read. */
export interface ViewSnapshotCachePort {
  get<K extends keyof ViewSnapshots>(scope: SnapshotScope<K>, signal?: AbortSignal): ViewSnapshots[K] | null;
  beginRead<K extends keyof ViewSnapshots>(scope: SnapshotScope<K>): {
    store(snapshot: ViewSnapshots[K], signal?: AbortSignal): void;
  };
  /** Invalidates immediately and again when the complete write attempt settles. */
  beginWrite(scope?: SnapshotWriteScope): () => void;
}
