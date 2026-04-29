import * as React from "react";

import { setFilterPreferenceStore } from "./set-filter-preference-store.js";
import type {
  SetFilterPreference,
  TestCaseColumnFilterPreference,
  WorkItemColumnFilterPreference
} from "../../shared/user-preferences/user-preferences.client.js";

export type SetFiltersApi = {
  testCaseFilter: TestCaseColumnFilterPreference;
  workItemFilter: WorkItemColumnFilterPreference;
  setTestCaseFilter(next: TestCaseColumnFilterPreference): void;
  setWorkItemFilter(next: WorkItemColumnFilterPreference): void;
  clearTestCaseFilter(): void;
  clearWorkItemFilter(): void;
};

const EMPTY_TEST_CASE_FILTER: TestCaseColumnFilterPreference = Object.freeze({});
const EMPTY_WORK_ITEM_FILTER: WorkItemColumnFilterPreference = Object.freeze({});

/**
 * Per-set filter state mirrored to lowdb. Re-seeds whenever `setId` changes
 * (Phase 5 set-switch ergonomics) and writes the merged shape back via
 * `persistUserPreferencesPatch` — same persistence contract as
 * `useSuiteCollapse` so the cached preferences object stays the source of
 * truth even when multiple hooks coexist.
 */
export function useSetFilters(setId: string | null): SetFiltersApi {
  const [filter, setFilter] = React.useState<SetFilterPreference>(() =>
    seedFromPreferences(setId)
  );

  React.useEffect(() => {
    setFilter(seedFromPreferences(setId));
  }, [setId]);

  const persist = React.useCallback(
    (next: SetFilterPreference) => {
      if (!setId) {
        return;
      }
      setFilterPreferenceStore.save(next, { scopeKey: setId });
    },
    [setId]
  );

  const setTestCaseFilter = React.useCallback(
    (next: TestCaseColumnFilterPreference) => {
      setFilter((current) => {
        const merged = mergeColumn(current, "testCases", next);
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  const setWorkItemFilter = React.useCallback(
    (next: WorkItemColumnFilterPreference) => {
      setFilter((current) => {
        const merged = mergeColumn(current, "workItems", next);
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  const clearTestCaseFilter = React.useCallback(() => {
    setTestCaseFilter({});
  }, [setTestCaseFilter]);

  const clearWorkItemFilter = React.useCallback(() => {
    setWorkItemFilter({});
  }, [setWorkItemFilter]);

  return {
    testCaseFilter: filter.testCases ?? EMPTY_TEST_CASE_FILTER,
    workItemFilter: filter.workItems ?? EMPTY_WORK_ITEM_FILTER,
    setTestCaseFilter,
    setWorkItemFilter,
    clearTestCaseFilter,
    clearWorkItemFilter
  };
}

function mergeColumn(
  current: SetFilterPreference,
  key: "testCases" | "workItems",
  next: TestCaseColumnFilterPreference | WorkItemColumnFilterPreference
): SetFilterPreference {
  const merged: SetFilterPreference = { ...current };
  if (isEmptyColumn(next)) {
    delete merged[key];
  } else if (key === "testCases") {
    merged.testCases = next as TestCaseColumnFilterPreference;
  } else {
    merged.workItems = next as WorkItemColumnFilterPreference;
  }
  return merged;
}

function isEmptyColumn(
  value: TestCaseColumnFilterPreference | WorkItemColumnFilterPreference
): boolean {
  if (value.titleQuery && value.titleQuery.trim().length > 0) {
    return false;
  }
  for (const key of ["lastOutcomes", "states", "assignedTo", "tags", "workItemTypes"] as const) {
    const list = (value as Record<string, readonly string[] | undefined>)[key];
    if (list && list.length > 0) {
      return false;
    }
  }
  return true;
}

function seedFromPreferences(setId: string | null): SetFilterPreference {
  if (!setId) {
    return {};
  }
  return setFilterPreferenceStore.load({ scopeKey: setId }) ?? {};
}
