import * as React from "react";

import type { ActiveSetSnapshot } from "../../domain/sets/set.js";
import type { SnapshotProgressEvent } from "../../application/use-cases/load-active-set-snapshot.use-case.js";

export type SnapshotState = {
  snapshot: ActiveSetSnapshot | null;
  progress: SnapshotProgressEvent | null;
  isLoading: boolean;
  error: string | null;
};

const INITIAL_STATE: SnapshotState = {
  snapshot: null,
  progress: null,
  isLoading: false,
  error: null
};

/**
 * Subscribes to the `/phase2/active-set/snapshot/stream` SSE endpoint and
 * exposes a stateful `{ snapshot, progress, isLoading, error }`. Calling
 * `refresh()` re-opens the stream and starts a fresh load.
 *
 * Why we manage the EventSource manually rather than via a library: the
 * payload mixes named events (`progress`, `result`, `error`) and we want
 * deterministic teardown when the user triggers another refresh mid-flight.
 */
export function useActiveSetSnapshot(setId: string | null): {
  state: SnapshotState;
  refresh(): void;
} {
  const [state, setState] = React.useState<SnapshotState>(INITIAL_STATE);
  const sourceRef = React.useRef<EventSource | null>(null);

  const closeSource = React.useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  const refresh = React.useCallback(() => {
    closeSource();
    if (!setId) {
      setState({ ...INITIAL_STATE });
      return;
    }
    if (typeof EventSource === "undefined") {
      setState({ ...INITIAL_STATE, error: "SSE not supported in this environment." });
      return;
    }

    setState({ snapshot: null, progress: null, isLoading: true, error: null });

    const source = new EventSource(
      `/phase2/active-set/snapshot/stream?setId=${encodeURIComponent(setId)}`
    );
    sourceRef.current = source;

    source.addEventListener("progress", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as SnapshotProgressEvent;
        setState((current) => ({ ...current, progress: data }));
      } catch {
        // Ignore malformed events — nothing actionable client-side.
      }
    });

    source.addEventListener("result", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { snapshot: ActiveSetSnapshot };
        setState((current) => ({
          ...current,
          snapshot: payload.snapshot,
          progress: { stage: "done", done: 1, total: 1 },
          isLoading: false,
          error: null
        }));
      } catch {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: "Received malformed snapshot result."
        }));
      } finally {
        closeSource();
      }
    });

    source.addEventListener("error", (event) => {
      const message = readErrorMessage(event) ?? "Snapshot stream failed.";
      setState((current) => ({
        ...current,
        isLoading: false,
        error: message
      }));
      closeSource();
    });

    source.onerror = () => {
      setState((current) => {
        if (current.snapshot || current.error) {
          return current;
        }
        return { ...current, isLoading: false, error: "Snapshot stream connection lost." };
      });
      closeSource();
    };
  }, [setId, closeSource]);

  React.useEffect(() => {
    refresh();
    return () => {
      closeSource();
    };
  }, [refresh, closeSource]);

  return { state, refresh };
}

function readErrorMessage(event: Event): string | null {
  if (event instanceof MessageEvent && typeof event.data === "string" && event.data.length > 0) {
    try {
      const parsed = JSON.parse(event.data) as { code?: unknown; message?: unknown };
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
      if (typeof parsed.code === "string") {
        return parsed.code;
      }
    } catch {
      return event.data;
    }
  }
  return null;
}
