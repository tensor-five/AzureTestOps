import type { ActiveSetSnapshot } from "../../dto/active-set-snapshot.dto.js";
import type { SnapshotProgressEvent } from "../../use-cases/load-active-set-snapshot.use-case.js";

/**
 * Streaming events emitted while the local server orchestrates a snapshot
 * load. The browser-side adapter is responsible for translating the
 * underlying transport (SSE today) into these typed events.
 */
export type ActiveSetSnapshotStreamEvent =
  | { type: "progress"; progress: SnapshotProgressEvent }
  | { type: "result"; snapshot: ActiveSetSnapshot }
  | { type: "error"; message: string };

export type ActiveSetSnapshotStreamSubscription = {
  /** Closes the underlying transport. Idempotent — safe to call repeatedly. */
  close(): void;
};

/**
 * Browser-facing port for the streaming "load active set snapshot" read.
 *
 * The transport is intentionally hidden behind the port: hooks subscribe via
 * a callback and tear down through the returned subscription, mirroring how
 * the SSE consumer already worked.
 */
export interface ActiveSetSnapshotClientPort {
  subscribe(
    setId: string,
    onEvent: (event: ActiveSetSnapshotStreamEvent) => void
  ): ActiveSetSnapshotStreamSubscription;
}
