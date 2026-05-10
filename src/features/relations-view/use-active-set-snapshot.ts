import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
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
 * Subscribes to the active-set snapshot stream via {@link
 * ActiveSetSnapshotClientPort} and exposes a stateful
 * `{ snapshot, progress, isLoading, error }`. Calling `refresh()` re-opens the
 * stream and starts a fresh load.
 *
 * Why we manage the subscription manually rather than via a library: the
 * stream mixes named events (`progress`, `result`, `error`) and we want
 * deterministic teardown when the user triggers another refresh mid-flight.
 */
export function useActiveSetSnapshot(setId: string | null): {
  state: SnapshotState;
  refresh(): void;
} {
  const { activeSetSnapshot } = useClientPorts();
  const [state, setState] = React.useState<SnapshotState>(INITIAL_STATE);
  const subscriptionRef = React.useRef<{ close(): void } | null>(null);

  const closeSubscription = React.useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
      subscriptionRef.current = null;
    }
  }, []);

  const refresh = React.useCallback(() => {
    closeSubscription();
    if (!setId) {
      setState({ ...INITIAL_STATE });
      return;
    }

    setState({ snapshot: null, progress: null, isLoading: true, error: null });

    subscriptionRef.current = activeSetSnapshot.subscribe(setId, (event) => {
      if (event.type === "progress") {
        setState((current) => ({ ...current, progress: event.progress }));
        return;
      }
      if (event.type === "result") {
        setState((current) => ({
          ...current,
          snapshot: event.snapshot,
          progress: { stage: "done", done: 1, total: 1 },
          isLoading: false,
          error: null
        }));
        closeSubscription();
        return;
      }
      // type === "error"
      setState((current) => {
        if (current.snapshot) {
          return current;
        }
        return { ...current, isLoading: false, error: event.message };
      });
      closeSubscription();
    });
  }, [setId, closeSubscription, activeSetSnapshot]);

  React.useEffect(() => {
    refresh();
    return () => {
      closeSubscription();
    };
  }, [refresh, closeSubscription]);

  return { state, refresh };
}
