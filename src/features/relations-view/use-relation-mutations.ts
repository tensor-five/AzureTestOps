import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import type { RelationLinkRequest } from "../../application/dto/relation-link.dto.js";

type Override = "added" | "removed";

export type RelationMutationsApi = {
  isRelated(testCaseId: number, workItemId: number): boolean;
  isPending(testCaseId: number, workItemId: number): boolean;
  addRelation(testCaseId: number, workItemId: number): Promise<void>;
  removeRelation(testCaseId: number, workItemId: number): Promise<void>;
  error: string | null;
  clearError(): void;
};

export type RelationMutationsDeps = {
  /**
   * Stable identifier for the underlying snapshot. When it changes the hook
   * drops every optimistic override so the next render reflects the reloaded
   * Azure state.
   */
  snapshotKey: string | null;
  /** Source of truth: does Azure DevOps currently know this `Related` link? */
  isRelatedInSnapshot(testCaseId: number, workItemId: number): boolean;
  /** Override seam for tests; production wiring uses the relation-mutations client port. */
  createRelation?: (link: RelationLinkRequest) => Promise<void>;
  /** Override seam for tests; production wiring uses the relation-mutations client port. */
  deleteRelation?: (link: RelationLinkRequest) => Promise<void>;
};

/**
 * Optimistic-update layer on top of the relation-mutations client port.
 *
 * Render-time queries go through {@link RelationMutationsApi.isRelated}, which
 * combines snapshot truth with local overrides ("added" / "removed"). The
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

  React.useEffect(() => {
    setOverrides(new Map());
    setPending(new Set());
    setError(null);
  }, [deps.snapshotKey]);

  const isRelatedInSnapshotRef = React.useRef(deps.isRelatedInSnapshot);
  isRelatedInSnapshotRef.current = deps.isRelatedInSnapshot;

  const overridesRef = React.useRef(overrides);
  overridesRef.current = overrides;

  const isRelated = React.useCallback(
    (tc: number, wi: number): boolean => {
      const override = overrides.get(makeKey(tc, wi));
      if (override === "added") return true;
      if (override === "removed") return false;
      return isRelatedInSnapshotRef.current(tc, wi);
    },
    [overrides]
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
    return isRelatedInSnapshotRef.current(tc, wi);
  }, []);

  const addRelation = React.useCallback(
    async (tc: number, wi: number): Promise<void> => {
      if (!isPositiveLink(tc, wi)) {
        return;
      }
      if (isRelatedNow(tc, wi)) {
        return;
      }
      const key = makeKey(tc, wi);
      setOverride(key, "added");
      markPending(key, true);
      try {
        await create({ sourceId: tc, targetId: wi });
      } catch (err) {
        dropOverride(key);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        markPending(key, false);
      }
    },
    [create, dropOverride, isRelatedNow, markPending, setOverride]
  );

  const removeRelation = React.useCallback(
    async (tc: number, wi: number): Promise<void> => {
      if (!isPositiveLink(tc, wi)) {
        return;
      }
      if (!isRelatedNow(tc, wi)) {
        return;
      }
      const key = makeKey(tc, wi);
      setOverride(key, "removed");
      markPending(key, true);
      try {
        await remove({ sourceId: tc, targetId: wi });
      } catch (err) {
        dropOverride(key);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        markPending(key, false);
      }
    },
    [remove, dropOverride, isRelatedNow, markPending, setOverride]
  );

  const clearError = React.useCallback(() => setError(null), []);

  return { isRelated, isPending, addRelation, removeRelation, error, clearError };
}

export function makeRelationKey(testCaseId: number, workItemId: number): string {
  return makeKey(testCaseId, workItemId);
}

function makeKey(testCaseId: number, workItemId: number): string {
  return `${testCaseId}::${workItemId}`;
}

function isPositiveLink(a: number, b: number): boolean {
  return Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0 && a !== b;
}
