import * as React from "react";

import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type SuiteCollapseApi = {
  collapsedSuiteIds: ReadonlySet<string>;
  isCollapsed(suiteId: number): boolean;
  toggle(suiteId: number): void;
  collapseAll(suiteIds: readonly number[]): void;
  expandAll(): void;
};

/**
 * Mirrors collapse state to lowdb on every toggle so it survives reloads
 * per-set. Re-seeds from the cached preferences when `setId` changes.
 */
export function useSuiteCollapse(setId: string | null): SuiteCollapseApi {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() =>
    seedFromPreferences(setId)
  );

  React.useEffect(() => {
    setCollapsed(seedFromPreferences(setId));
  }, [setId]);

  const persist = React.useCallback(
    (next: Set<string>) => {
      if (!setId) {
        return;
      }
      const layoutForSet = readLayoutForSet(setId);
      const merged: SetLayoutPreference = {
        ...layoutForSet,
        collapsedSuites: [...next].sort()
      };
      setLayoutPreferenceStore.save(merged, { scopeKey: setId });
    },
    [setId]
  );

  const toggle = React.useCallback(
    (suiteId: number) => {
      setCollapsed((current) => {
        const next = new Set(current);
        const key = String(suiteId);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isCollapsed = React.useCallback(
    (suiteId: number) => collapsed.has(String(suiteId)),
    [collapsed]
  );

  const collapseAll = React.useCallback(
    (suiteIds: readonly number[]) => {
      const next = new Set(
        suiteIds
          .filter((suiteId) => Number.isInteger(suiteId) && suiteId > 0)
          .map(String)
      );
      setCollapsed(next);
      persist(next);
    },
    [persist]
  );

  const expandAll = React.useCallback(() => {
    const next = new Set<string>();
    setCollapsed(next);
    persist(next);
  }, [persist]);

  return {
    collapsedSuiteIds: collapsed,
    isCollapsed,
    toggle,
    collapseAll,
    expandAll
  };
}

function seedFromPreferences(setId: string | null): Set<string> {
  if (!setId) {
    return new Set();
  }
  const layout = readLayoutForSet(setId);
  if (!layout?.collapsedSuites?.length) {
    return new Set();
  }
  return new Set(layout.collapsedSuites);
}

function readLayoutForSet(setId: string): SetLayoutPreference | undefined {
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? undefined;
}
