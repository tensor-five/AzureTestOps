import * as React from "react";

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
   * source/target suite ids match before invoking `move`.
   */
  move(
    suiteId: number,
    draggedId: number,
    targetId: number,
    edge: "before" | "after"
  ): void;
};

type OrderMap = Readonly<Record<string, readonly number[]>>;

/**
 * Persists the user's drag-and-drop ordering of Test Cases per Suite per Set
 * in lowdb. Mirrors the merge-then-save shape used by `useSuiteCollapse` and
 * `useWorkItemOrder` so the three fields share one `setLayouts[setId]` record
 * without clobbering each other.
 */
export function useTestCaseOrder(setId: string | null): TestCaseOrderApi {
  const [order, setOrder] = React.useState<OrderMap>(() => seedFromPreferences(setId));

  React.useEffect(() => {
    setOrder(seedFromPreferences(setId));
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
      edge: "before" | "after"
    ) => {
      if (draggedId === targetId) {
        return;
      }
      setOrder((current) => {
        const key = String(suiteId);
        const currentForSuite = current[key] ?? [];
        const next = currentForSuite.slice();
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
        const merged: OrderMap = { ...current, [key]: next };
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  const sortByStoredOrder = React.useCallback(
    <T extends { workItemId: number }>(
      suiteId: number,
      items: readonly T[]
    ): T[] => {
      const stored = order[String(suiteId)];
      if (!stored || stored.length === 0) {
        return items.slice();
      }
      const orderIndex = new Map<number, number>();
      stored.forEach((id, idx) => orderIndex.set(id, idx));
      const known: T[] = [];
      const unknown: T[] = [];
      for (const item of items) {
        if (orderIndex.has(item.workItemId)) {
          known.push(item);
        } else {
          unknown.push(item);
        }
      }
      known.sort((a, b) => {
        const ai = orderIndex.get(a.workItemId) ?? 0;
        const bi = orderIndex.get(b.workItemId) ?? 0;
        return ai - bi;
      });
      return [...known, ...unknown];
    },
    [order]
  );

  return { sortByStoredOrder, move };
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
