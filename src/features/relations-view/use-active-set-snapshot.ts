import * as React from "react";
import type { TestCaseOutcomeUpdate } from '../../domain/test-management/test-case-outcome-update.js';
import { applyConfirmedOutcomes } from '../../shared/test-management/apply-confirmed-outcomes.js';

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
export function useActiveSetSnapshot(setId: string | null, scopeKey = setId): {
  state: SnapshotState;
  refresh(): void;
  applyOutcome(projection: TestCaseOutcomeUpdate): void;
} {
  const { activeSetSnapshot } = useClientPorts();
  const [state, setState] = React.useState<SnapshotState>(INITIAL_STATE);
  const subscriptionRef = React.useRef<{ close(): void } | null>(null);

  const generation = React.useRef(0);
  const currentScope = React.useRef(scopeKey);
  currentScope.current = scopeKey;
  const outcomeUpdates = React.useRef<TestCaseOutcomeUpdate[]>([]);
  const applyOutcome = React.useCallback((projection: TestCaseOutcomeUpdate) => {
    if (currentScope.current !== scopeKey) return;
    outcomeUpdates.current = [...outcomeUpdates.current.filter(value => value.suiteId !== projection.suiteId
      || value.workItemId !== projection.workItemId), projection];
    setState(current => current.snapshot?.set.id === setId ? { ...current, snapshot: {
      ...current.snapshot, projections: applyConfirmedOutcomes(current.snapshot.projections, [projection])
    } } : current);
  }, [setId, scopeKey]);

  const closeSubscription = React.useCallback(() => {
    generation.current++;
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
      subscriptionRef.current = null;
    }
  }, []);

  const refresh = React.useCallback(() => {
    closeSubscription();
    outcomeUpdates.current = [];
    if (!setId) {
      setState({ ...INITIAL_STATE });
      return;
    }

    setState({ snapshot: null, progress: null, isLoading: true, error: null });

    const requestGeneration = generation.current;
    subscriptionRef.current = activeSetSnapshot.subscribe(setId, (event) => {
      if (generation.current !== requestGeneration || currentScope.current !== scopeKey) return;
      if (event.type === "progress") {
        setState((current) => ({ ...current, progress: event.progress }));
        return;
      }
      if (event.type === "result") {
        setState((current) => ({
          ...current,
          snapshot: { ...event.snapshot, projections: applyConfirmedOutcomes(event.snapshot.projections, outcomeUpdates.current) },
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
  }, [setId, scopeKey, closeSubscription, activeSetSnapshot]);

  React.useEffect(() => {
    refresh();
    return () => {
      closeSubscription();
    };
  }, [refresh, closeSubscription]);

  return { state, refresh, applyOutcome };
}
