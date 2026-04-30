import { createUserPreferenceStore } from "../../shared/user-preferences/create-user-preference-store.js";
import type {
  SetFilterPreference,
  SetFiltersBySetId,
  TestCaseColumnFilterPreference,
  UserPreferences,
  WorkItemColumnFilterPreference
} from "../../shared/user-preferences/user-preferences.schema.js";

const SET_FILTER_STORAGE_KEY = "azure-testops.set-filters.v1";

/**
 * Per-Set column filter preference. Wraps the lowdb-persisted `setFilters`
 * branch behind a typed store. Keeps explicit empty subobjects (`testCases:
 * {}`) intact so callers can clear a single column without losing the other.
 * Final on-disk compaction is handled by `sanitizeUserPreferences`.
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
  buildPatch: (value, preferences, scopeKey) => {
    if (!scopeKey) {
      return {};
    }
    // Construct the full intended setFilters map so the backend can apply
    // deletions: clearing a column to {} would otherwise be stripped by
    // sanitization and silently kept on disk via `incoming ?? current`.
    const nextFilters: SetFiltersBySetId = { ...(preferences.setFilters ?? {}) };
    if (Object.keys(value).length === 0) {
      delete nextFilters[scopeKey];
    } else {
      nextFilters[scopeKey] = value;
    }
    return { setFilters: nextFilters } satisfies Partial<UserPreferences>;
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
