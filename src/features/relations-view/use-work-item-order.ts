import * as React from "react";

import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type WorkItemOrderApi = {
  /**
   * Sort the given items by the persisted order. Items missing from the
   * stored order keep their incoming order at the tail (callers pass the
   * already-id-sorted list so unknown items appear deterministically).
   */
  sortByStoredOrder<T extends { id: number }>(items: readonly T[]): T[];
  /**
   * Move `draggedId` immediately before or after `targetId` in the persisted
   * order. Both ids are added to the order if they aren't yet tracked, so a
   * drag onto a never-reordered item still produces a stable sequence.
   */
  move(draggedId: number, targetId: number, edge: "before" | "after"): void;
};

/**
 * Persists the user's drag-and-drop ordering of Work Items per Set in lowdb.
 * Mirrors the merge-then-save shape used by `useSuiteCollapse` so the two
 * fields share a single `setLayouts[setId]` record without clobbering each
 * other.
 */
export function useWorkItemOrder(setId: string | null): WorkItemOrderApi {
  const [order, setOrder] = React.useState<readonly number[]>(() => seedFromPreferences(setId));

  React.useEffect(() => {
    setOrder(seedFromPreferences(setId));
  }, [setId]);

  const persist = React.useCallback(
    (next: readonly number[]) => {
      if (!setId) {
        return;
      }
      const layoutForSet = readLayoutForSet(setId);
      const merged: SetLayoutPreference = {
        ...layoutForSet,
        workItemOrder: [...next]
      };
      setLayoutPreferenceStore.save(merged, { scopeKey: setId });
    },
    [setId]
  );

  const move = React.useCallback(
    (draggedId: number, targetId: number, edge: "before" | "after") => {
      if (draggedId === targetId) {
        return;
      }
      setOrder((current) => {
        const next = current.slice();
        const draggedIndex = next.indexOf(draggedId);
        if (draggedIndex !== -1) {
          next.splice(draggedIndex, 1);
        }
        let targetIndex = next.indexOf(targetId);
        if (targetIndex === -1) {
          next.push(targetId);
          targetIndex = next.length - 1;
        }
        const insertAt = edge === "after" ? targetIndex + 1 : targetIndex;
        next.splice(insertAt, 0, draggedId);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const sortByStoredOrder = React.useCallback(
    <T extends { id: number }>(items: readonly T[]): T[] => {
      if (order.length === 0) {
        return items.slice();
      }
      const orderIndex = new Map<number, number>();
      order.forEach((id, idx) => orderIndex.set(id, idx));
      const known: T[] = [];
      const unknown: T[] = [];
      for (const item of items) {
        if (orderIndex.has(item.id)) {
          known.push(item);
        } else {
          unknown.push(item);
        }
      }
      known.sort((a, b) => {
        const ai = orderIndex.get(a.id) ?? 0;
        const bi = orderIndex.get(b.id) ?? 0;
        return ai - bi;
      });
      return [...known, ...unknown];
    },
    [order]
  );

  return { sortByStoredOrder, move };
}

function seedFromPreferences(setId: string | null): readonly number[] {
  if (!setId) {
    return [];
  }
  const layout = readLayoutForSet(setId);
  return layout?.workItemOrder ?? [];
}

function readLayoutForSet(setId: string): SetLayoutPreference | undefined {
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? undefined;
}
