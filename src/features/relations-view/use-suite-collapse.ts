import * as React from "react";

import {
  getCachedUserPreferences,
  persistUserPreferencesPatch
} from "../../shared/user-preferences/user-preferences.client.js";
import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type SuiteCollapseApi = {
  collapsedSuiteIds: ReadonlySet<string>;
  isCollapsed(suiteId: number): boolean;
  toggle(suiteId: number): void;
  collapseAll(suiteIds: readonly number[]): void;
  expandAll(): void;
};

/**
 * Tracks which suites are collapsed in the Test Cases column for the active set.
 *
 * The state is mirrored to lowdb via `persistUserPreferencesPatch` so that the
 * collapse state survives reloads on a per-set basis. When the active set
 * changes the hook re-seeds from the cached preferences.
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
      persistUserPreferencesPatch({ setLayouts: { [setId]: merged } });
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

  const collapseAll = React.useCallback(
    (suiteIds: readonly number[]) => {
      setCollapsed(() => {
        const next = new Set(suiteIds.map((id) => String(id)));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const expandAll = React.useCallback(() => {
    setCollapsed(() => {
      const next = new Set<string>();
      persist(next);
      return next;
    });
  }, [persist]);

  const isCollapsed = React.useCallback(
    (suiteId: number) => collapsed.has(String(suiteId)),
    [collapsed]
  );

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
  const preferences = getCachedUserPreferences();
  return preferences.setLayouts?.[setId];
}
