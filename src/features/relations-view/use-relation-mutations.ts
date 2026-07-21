import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import type { RelationLinkRequest } from "../../application/dto/relation-link.dto.js";
import {
  buildRelationAdjacencyIndex,
  snapshotRelationKey,
  type RelationAdjacencyIndex
} from "../../domain/relations/snapshot-relation-index.js";

type Override = "added" | "removed";

export type RelationMutationsApi = {
  isRelated(testCaseId: number, workItemId: number): boolean;
  isPending(testCaseId: number, workItemId: number): boolean;
  relationIndex: RelationAdjacencyIndex;
  addRelation(testCaseId: number, workItemId: number): Promise<void>;
  removeRelation(testCaseId: number, workItemId: number): Promise<void>;
  error: string | null;
  clearError(): void;
};

export type RelationMutationsDeps = {
  /**
   * Stable identifier for the underlying snapshot. When it changes the hook
   * drops in-flight optimistic overrides so the next render reflects the
   * reloaded Azure state. Successfully persisted effects remain projected
   * until a later snapshot confirms them.
   */
  snapshotKey: string | null;
  /** Enumerated source of truth for the active Azure DevOps snapshot. */
  snapshotRelations: ReadonlySet<string>;
  /** Override seam for tests; production wiring uses the relation-mutations client port. */
  createRelation?: (link: RelationLinkRequest) => Promise<void>;
  /** Override seam for tests; production wiring uses the relation-mutations client port. */
  deleteRelation?: (link: RelationLinkRequest) => Promise<void>;
};

/**
 * Optimistic-update layer on top of the relation-mutations client port.
 *
 * Render-time queries go through the shared adjacency index, which combines
 * snapshot truth with local overrides ("added" / "removed"). The
 * mutation methods flip the override immediately, fire the request, and roll
 * back on failure — surfacing the message via `error` so the caller can show a
 * toast without juggling promise rejections in event handlers.
 */
export function useRelationMutations(deps: RelationMutationsDeps): RelationMutationsApi {
  const { relationMutations } = useClientPorts();
  const create = deps.createRelation ?? ((link) => relationMutations.add(link));
  const remove = deps.deleteRelation ?? ((link) => relationMutations.remove(link));

  const [overrides, setOverrides] = React.useState<Map<string, Override>>(() => new Map());
  const [pending, setPending] = React.useState<Set<string>>(() => new Set());
  const [error, setError] = React.useState<string | null>(null);
  const snapshotGenerationRef = React.useRef(0);
  const snapshotKeyRef = React.useRef(deps.snapshotKey);
  const inFlightIntentsRef = React.useRef<Map<string, Override>>(new Map());
  const inFlightGenerationsRef = React.useRef<Map<string, number>>(new Map());
  const inFlightPromisesRef = React.useRef<Map<string, Promise<void>>>(new Map());
  const queuedIntentsRef = React.useRef<Map<string, Override>>(new Map());
  const confirmedOverridesRef = React.useRef<Map<string, Override>>(new Map());
  const snapshotRelationsRef = React.useRef(deps.snapshotRelations);
  snapshotRelationsRef.current = deps.snapshotRelations;

  if (snapshotKeyRef.current !== deps.snapshotKey) {
    snapshotKeyRef.current = deps.snapshotKey;
    snapshotGenerationRef.current += 1;
  }

  React.useLayoutEffect(() => {
    setOverrides(
      reconcileConfirmedOverrides(
        confirmedOverridesRef.current,
        snapshotRelationsRef.current
      )
    );
    // Transport requests cannot be cancelled reliably. Preserve their keys
    // across snapshot generations so the same ADO relation stays serialized
    // until the older request has actually settled.
    setPending(new Set(inFlightIntentsRef.current.keys()));
    setError(null);
  }, [deps.snapshotKey]);

  const overridesRef = React.useRef(overrides);
  overridesRef.current = overrides;

  const relationIndex = React.useMemo(
    () => buildRelationAdjacencyIndex(applyOverrides(deps.snapshotRelations, overrides)),
    [deps.snapshotRelations, overrides]
  );

  const isRelated = React.useCallback(
    (tc: number, wi: number): boolean =>
      relationIndex.relationKeys.has(snapshotRelationKey(tc, wi)),
    [relationIndex]
  );

  const isPending = React.useCallback(
    (tc: number, wi: number): boolean => pending.has(makeKey(tc, wi)),
    [pending]
  );

  const setOverride = React.useCallback((key: string, value: Override): void => {
    setOverrides((current) => {
      const next = new Map(current);
      next.set(key, value);
      return next;
    });
  }, []);

  const dropOverride = React.useCallback((key: string): void => {
    setOverrides((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const confirmOverride = React.useCallback((key: string, value: Override): void => {
    const confirmedOverrides = confirmedOverridesRef.current;
    if (snapshotMatchesOverride(snapshotRelationsRef.current, key, value)) {
      confirmedOverrides.delete(key);
      dropOverride(key);
      return;
    }

    confirmedOverrides.set(key, value);
    setOverride(key, value);
  }, [dropOverride, setOverride]);

  const restoreConfirmedOverride = React.useCallback((key: string): void => {
    const confirmed = confirmedOverridesRef.current.get(key);
    if (
      confirmed &&
      !snapshotMatchesOverride(snapshotRelationsRef.current, key, confirmed)
    ) {
      setOverride(key, confirmed);
      return;
    }

    if (confirmed) {
      confirmedOverridesRef.current.delete(key);
    }
    dropOverride(key);
  }, [dropOverride, setOverride]);

  const markPending = React.useCallback((key: string, on: boolean): void => {
    setPending((current) => {
      const has = current.has(key);
      if (on === has) {
        return current;
      }
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const isRelatedNow = React.useCallback((tc: number, wi: number): boolean => {
    const key = makeKey(tc, wi);
    const override = overridesRef.current.get(key);
    if (override === "added") return true;
    if (override === "removed") return false;
    return snapshotRelationsRef.current.has(key);
  }, []);

  const isConfirmedRelatedNow = React.useCallback((key: string): boolean => {
    const confirmed = confirmedOverridesRef.current.get(key);
    if (confirmed) {
      return confirmed === "added";
    }
    return snapshotRelationsRef.current.has(key);
  }, []);

  const runMutationChain = React.useCallback(
    async (tc: number, wi: number, initialIntent: Override): Promise<void> => {
      const key = makeKey(tc, wi);
      let intent = initialIntent;

      try {
        while (true) {
          inFlightIntentsRef.current.set(key, intent);
          const operationGeneration = snapshotGenerationRef.current;
          inFlightGenerationsRef.current.set(key, operationGeneration);
          try {
            const mutate = intent === "added" ? create : remove;
            await mutate({ sourceId: tc, targetId: wi });
            confirmOverride(key, intent);
          } catch (err) {
            if (snapshotGenerationRef.current === operationGeneration) {
              restoreConfirmedOverride(key);
              setError(err instanceof Error ? err.message : String(err));
            }
          }

          const queuedIntent = queuedIntentsRef.current.get(key);
          queuedIntentsRef.current.delete(key);
          if (!queuedIntent) {
            break;
          }

          const queuedStateIsAlreadyConfirmed =
            isConfirmedRelatedNow(key) === (queuedIntent === "added");
          if (queuedStateIsAlreadyConfirmed) {
            restoreConfirmedOverride(key);
            break;
          }

          intent = queuedIntent;
          setOverride(key, intent);
        }
      } finally {
        inFlightIntentsRef.current.delete(key);
        inFlightGenerationsRef.current.delete(key);
        inFlightPromisesRef.current.delete(key);
        queuedIntentsRef.current.delete(key);
        markPending(key, false);
      }
    },
    [
      confirmOverride,
      create,
      isConfirmedRelatedNow,
      markPending,
      remove,
      restoreConfirmedOverride,
      setOverride
    ]
  );

  const requestMutation = React.useCallback(
    (tc: number, wi: number, intent: Override): Promise<void> => {
      if (!isPositiveLink(tc, wi)) {
        return Promise.resolve();
      }

      const key = makeKey(tc, wi);
      const activeIntent = inFlightIntentsRef.current.get(key);
      if (activeIntent) {
        const activeGeneration = inFlightGenerationsRef.current.get(key);
        const isCurrentGenerationDuplicate =
          activeIntent === intent && activeGeneration === snapshotGenerationRef.current;
        if (isCurrentGenerationDuplicate) {
          queuedIntentsRef.current.delete(key);
        } else {
          queuedIntentsRef.current.set(key, intent);
        }
        setOverride(key, intent);
        return inFlightPromisesRef.current.get(key) ?? Promise.resolve();
      }

      const requestedStateAlreadyVisible =
        isRelatedNow(tc, wi) === (intent === "added");
      if (requestedStateAlreadyVisible) {
        return Promise.resolve();
      }

      inFlightIntentsRef.current.set(key, intent);
      inFlightGenerationsRef.current.set(key, snapshotGenerationRef.current);
      setOverride(key, intent);
      markPending(key, true);
      let resolveChain!: () => void;
      let rejectChain!: (error: unknown) => void;
      const chain = new Promise<void>((resolve, reject) => {
        resolveChain = resolve;
        rejectChain = reject;
      });
      inFlightPromisesRef.current.set(key, chain);
      void runMutationChain(tc, wi, intent).then(resolveChain, rejectChain);
      return chain;
    },
    [isRelatedNow, markPending, runMutationChain, setOverride]
  );

  const addRelation = React.useCallback(
    (tc: number, wi: number): Promise<void> => requestMutation(tc, wi, "added"),
    [requestMutation]
  );

  const removeRelation = React.useCallback(
    (tc: number, wi: number): Promise<void> => requestMutation(tc, wi, "removed"),
    [requestMutation]
  );

  const clearError = React.useCallback(() => setError(null), []);

  return {
    isRelated,
    isPending,
    relationIndex,
    addRelation,
    removeRelation,
    error,
    clearError
  };
}

export function makeRelationKey(testCaseId: number, workItemId: number): string {
  return makeKey(testCaseId, workItemId);
}

function makeKey(testCaseId: number, workItemId: number): string {
  return snapshotRelationKey(testCaseId, workItemId);
}

function applyOverrides(
  snapshotRelations: ReadonlySet<string>,
  overrides: ReadonlyMap<string, Override>
): ReadonlySet<string> {
  const next = new Set(snapshotRelations);
  overrides.forEach((override, key) => {
    if (override === "added") {
      next.add(key);
    } else {
      next.delete(key);
    }
  });
  return next;
}

function reconcileConfirmedOverrides(
  confirmedOverrides: Map<string, Override>,
  snapshotRelations: ReadonlySet<string>
): Map<string, Override> {
  const outstanding = new Map<string, Override>();
  confirmedOverrides.forEach((override, key) => {
    if (snapshotMatchesOverride(snapshotRelations, key, override)) {
      confirmedOverrides.delete(key);
      return;
    }
    outstanding.set(key, override);
  });
  return outstanding;
}

function snapshotMatchesOverride(
  snapshotRelations: ReadonlySet<string>,
  key: string,
  override: Override
): boolean {
  return snapshotRelations.has(key) === (override === "added");
}

function isPositiveLink(a: number, b: number): boolean {
  return Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0 && a !== b;
}
