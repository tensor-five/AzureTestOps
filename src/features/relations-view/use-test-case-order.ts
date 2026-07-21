import * as React from "react";

import {
  materializeItemOrder,
  moveItemInOrder,
  type ItemOrderEdge
} from "./item-order.js";
import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type TestCaseOrderApi = {
  /**
   * Sort the given items in `suiteId` by the persisted order. Items missing
   * from the stored order keep their incoming relative order at the tail —
   * the caller is expected to pass items already pre-sorted by the natural
   * fallback (e.g. title) so unknown items remain deterministic.
   */
  sortByStoredOrder<T extends { workItemId: number }>(
    suiteId: number,
    items: readonly T[]
  ): T[];
  /**
   * Move `draggedId` immediately before or after `targetId` within the given
   * suite. Reordering across suites is not allowed; the caller validates the
   * source/target suite ids match and supplies every naturally ordered id in
   * that suite before invoking `move`.
   */
  move(
    suiteId: number,
    draggedId: number,
    targetId: number,
    edge: ItemOrderEdge,
    naturalIds: readonly number[]
  ): void;
};

export type TestCaseOrderState = TestCaseOrderApi & {
  /** Monotonic signal for DOM consumers whose geometry changes after reorder. */
  layoutRevision: number;
};

type OrderMap = Readonly<Record<string, readonly number[]>>;

/**
 * Persists the user's drag-and-drop ordering of Test Cases per Suite per Set
 * in lowdb. Mirrors the merge-then-save shape used by `useSuiteCollapse` and
 * `useWorkItemOrder` so the three fields share one `setLayouts[setId]` record
 * without clobbering each other.
 */
export function useTestCaseOrder(setId: string | null): TestCaseOrderState {
  const [order, setOrder] = React.useState<OrderMap>(() => seedFromPreferences(setId));
  const [layoutRevision, bumpLayoutRevision] = React.useReducer(
    (current: number) => current + 1,
    0
  );

  React.useEffect(() => {
    setOrder(seedFromPreferences(setId));
    bumpLayoutRevision();
  }, [setId]);

  const persist = React.useCallback(
    (next: OrderMap) => {
      if (!setId) {
        return;
      }
      const layoutForSet = readLayoutForSet(setId);
      const cloned: Record<string, number[]> = {};
      Object.entries(next).forEach(([suiteId, ids]) => {
        cloned[suiteId] = [...ids];
      });
      const merged: SetLayoutPreference = {
        ...layoutForSet,
        testCaseOrder: cloned
      };
      setLayoutPreferenceStore.save(merged, { scopeKey: setId });
    },
    [setId]
  );

  const move = React.useCallback(
    (
      suiteId: number,
      draggedId: number,
      targetId: number,
      edge: ItemOrderEdge,
      naturalIds: readonly number[]
    ) => {
      if (draggedId === targetId) {
        return;
      }
      setOrder((current) => {
        const key = String(suiteId);
        const currentForSuite = current[key] ?? [];
        const next = moveItemInOrder(
          currentForSuite,
          naturalIds,
          draggedId,
          targetId,
          edge
        );
        const merged: OrderMap = { ...current, [key]: next };
        persist(merged);
        return merged;
      });
      bumpLayoutRevision();
    },
    [persist]
  );

  const sortByStoredOrder = React.useCallback(
    <T extends { workItemId: number }>(
      suiteId: number,
      items: readonly T[]
    ): T[] => {
      const stored = order[String(suiteId)];
      const completeOrder = materializeItemOrder(
        stored ?? [],
        items.map((item) => item.workItemId)
      );
      const orderIndex = new Map<number, number>();
      completeOrder.forEach((id, idx) => orderIndex.set(id, idx));
      return items.slice().sort((a, b) => {
        const ai = orderIndex.get(a.workItemId) ?? 0;
        const bi = orderIndex.get(b.workItemId) ?? 0;
        return ai - bi;
      });
    },
    [order]
  );

  return { sortByStoredOrder, move, layoutRevision };
}

function seedFromPreferences(setId: string | null): OrderMap {
  if (!setId) {
    return {};
  }
  const layout = readLayoutForSet(setId);
  return layout?.testCaseOrder ?? {};
}

function readLayoutForSet(setId: string): SetLayoutPreference | undefined {
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? undefined;
}
