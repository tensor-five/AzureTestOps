import { createUserPreferenceStore } from "../../shared/user-preferences/create-user-preference-store.js";
import type {
  SetFilterPreference,
  TestCaseColumnFilterPreference,
  UserPreferences,
  WorkItemColumnFilterPreference
} from "../../shared/user-preferences/user-preferences.schema.js";

const SET_FILTER_STORAGE_KEY = "azure-testops.set-filters.v1";

/**
 * Per-Set column filter preference. Wraps the lowdb-persisted `setFilters`
 * branch behind a typed store. The server applies a per-setId merge: an
 * empty value (`{}`) for a given setId signals "delete this entry", non-empty
 * values upsert. Other sets in `setFilters` are never touched by a single-set
 * patch.
 */
export function clearSetFilterPreferenceForTests(): void {
  setFilterPreferenceStore.clearForTests();
}

export const setFilterPreferenceStore = createUserPreferenceStore<SetFilterPreference>({
  storageKey: SET_FILTER_STORAGE_KEY,
  readFromServerCache: (preferences, scopeKey) => {
    if (!scopeKey) {
      return null;
    }
    return preferences.setFilters?.[scopeKey] ?? null;
  },
  sanitize: sanitizeSetFilterInput,
  buildPatch: (value, _preferences, scopeKey) => {
    if (!scopeKey) {
      return {};
    }
    return { setFilters: { [scopeKey]: value } } satisfies Partial<UserPreferences>;
  }
});

function sanitizeSetFilterInput(value: unknown): SetFilterPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: SetFilterPreference = {};
  if (isPlainRecord(value.testCases)) {
    next.testCases = sanitizeTestCaseColumn(value.testCases);
  }
  if (isPlainRecord(value.workItems)) {
    next.workItems = sanitizeWorkItemColumn(value.workItems);
  }
  return next;
}

function sanitizeTestCaseColumn(value: Record<string, unknown>): TestCaseColumnFilterPreference {
  const next: TestCaseColumnFilterPreference = {};
  applyTitleQuery(next, value.titleQuery);
  applyStringList(next, "lastOutcomes", value.lastOutcomes);
  applyStringList(next, "states", value.states);
  applyStringList(next, "assignedTo", value.assignedTo);
  applyStringList(next, "tags", value.tags);
  applyStringList(next, "workItemTypes", value.workItemTypes);
  return next;
}

function sanitizeWorkItemColumn(value: Record<string, unknown>): WorkItemColumnFilterPreference {
  const next: WorkItemColumnFilterPreference = {};
  applyTitleQuery(next, value.titleQuery);
  applyStringList(next, "states", value.states);
  applyStringList(next, "assignedTo", value.assignedTo);
  applyStringList(next, "tags", value.tags);
  applyStringList(next, "workItemTypes", value.workItemTypes);
  return next;
}

function applyTitleQuery(target: { titleQuery?: string }, raw: unknown): void {
  if (typeof raw !== "string") {
    return;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  target.titleQuery = trimmed;
}

function applyStringList<T extends Record<string, unknown>>(
  target: T,
  key: keyof T,
  raw: unknown
): void {
  if (!Array.isArray(raw)) {
    return;
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  if (cleaned.length === 0) {
    return;
  }
  (target as Record<string, unknown>)[key as string] = cleaned;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
