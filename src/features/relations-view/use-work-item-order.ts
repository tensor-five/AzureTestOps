import * as React from "react";

import {
  materializeItemOrder,
  moveItemInOrder,
  type ItemOrderEdge
} from "./item-order.js";
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
   * order. `naturalIds` contains the complete unfiltered snapshot order so
   * the persisted result remains stable across filters and long jumps.
   */
  move(
    draggedId: number,
    targetId: number,
    edge: ItemOrderEdge,
    naturalIds: readonly number[]
  ): void;
};

export type WorkItemOrderState = WorkItemOrderApi & {
  /** Monotonic signal for DOM consumers whose geometry changes after reorder. */
  layoutRevision: number;
};

/**
 * Persists the user's drag-and-drop ordering of Work Items per Set in lowdb.
 * Mirrors the merge-then-save shape used by `useSuiteCollapse` so the two
 * fields share a single `setLayouts[setId]` record without clobbering each
 * other.
 */
export function useWorkItemOrder(setId: string | null): WorkItemOrderState {
  const [order, setOrder] = React.useState<readonly number[]>(() => seedFromPreferences(setId));
  const [layoutRevision, bumpLayoutRevision] = React.useReducer(
    (current: number) => current + 1,
    0
  );

  React.useEffect(() => {
    setOrder(seedFromPreferences(setId));
    bumpLayoutRevision();
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
    (
      draggedId: number,
      targetId: number,
      edge: ItemOrderEdge,
      naturalIds: readonly number[]
    ) => {
      if (draggedId === targetId) {
        return;
      }
      setOrder((current) => {
        const next = moveItemInOrder(current, naturalIds, draggedId, targetId, edge);
        persist(next);
        return next;
      });
      bumpLayoutRevision();
    },
    [persist]
  );

  const sortByStoredOrder = React.useCallback(
    <T extends { id: number }>(items: readonly T[]): T[] => {
      const completeOrder = materializeItemOrder(order, items.map((item) => item.id));
      const orderIndex = new Map<number, number>();
      completeOrder.forEach((id, idx) => orderIndex.set(id, idx));
      return items.slice().sort((a, b) => {
        const ai = orderIndex.get(a.id) ?? 0;
        const bi = orderIndex.get(b.id) ?? 0;
        return ai - bi;
      });
    },
    [order]
  );

  return { sortByStoredOrder, move, layoutRevision };
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
