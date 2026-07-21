import { createUserPreferenceStore } from "../../shared/user-preferences/create-user-preference-store.js";
import {
  sanitizeUserPreferences,
  type SetLayoutPreference,
  type UserPreferences
} from "../../shared/user-preferences/user-preferences.schema.js";

const SET_LAYOUT_STORAGE_KEY = "azure-testops.set-layouts.v1";

/**
 * Per-Set layout preference (currently `collapsedSuites`; the schema also
 * carries legacy `positions` so older preference files round-trip cleanly).
 * `useSuiteCollapse` writes through this store so the `setLayouts[setId]`
 * shape is patched in one place. The on-disk compaction (drop empty entries)
 * is handled centrally by `sanitizeUserPreferences` in the persist path.
 */
export function clearSetLayoutPreferenceForTests(): void {
  setLayoutPreferenceStore.clearForTests();
}

export const setLayoutPreferenceStore = createUserPreferenceStore<SetLayoutPreference>({
  storageKey: SET_LAYOUT_STORAGE_KEY,
  readFromServerCache: (preferences, scopeKey) => {
    if (!scopeKey) {
      return null;
    }
    return preferences.setLayouts?.[scopeKey] ?? null;
  },
  sanitize: sanitizeSetLayoutInput,
  buildPatch: (value, _preferences, scopeKey) => {
    if (!scopeKey) {
      return {};
    }
    const sanitized = sanitizeUserPreferences({
      setLayouts: { [scopeKey]: value }
    }).setLayouts?.[scopeKey];
    return {
      setLayouts: { [scopeKey]: sanitized ?? {} }
    } satisfies Partial<UserPreferences>;
  }
});

function sanitizeSetLayoutInput(value: unknown): SetLayoutPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: SetLayoutPreference = {};

  if (isPlainRecord(value.positions)) {
    const positions: Record<string, { x: number; y: number }> = {};
    Object.entries(value.positions).forEach(([rawKey, rawPosition]) => {
      const key = typeof rawKey === "string" ? rawKey.trim() : "";
      if (key.length === 0 || !isPlainRecord(rawPosition)) {
        return;
      }
      const x = readFiniteNumber(rawPosition.x);
      const y = readFiniteNumber(rawPosition.y);
      if (x === null || y === null) {
        return;
      }
      positions[key] = { x, y };
    });
    next.positions = positions;
  }

  if (Array.isArray(value.collapsedSuites)) {
    const seen = new Set<string>();
    const collapsed: string[] = [];
    for (const entry of value.collapsedSuites) {
      const trimmed = typeof entry === "string" ? entry.trim() : "";
      if (trimmed.length === 0 || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      collapsed.push(trimmed);
    }
    next.collapsedSuites = collapsed;
  }

  if (typeof value.hideEmptySuites === "boolean") {
    next.hideEmptySuites = value.hideEmptySuites;
  }

  if (Array.isArray(value.workItemOrder)) {
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const entry of value.workItemOrder) {
      if (typeof entry !== "number" || !Number.isFinite(entry)) {
        continue;
      }
      if (!Number.isInteger(entry) || entry <= 0 || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      ordered.push(entry);
    }
    next.workItemOrder = ordered;
  }

  if (isPlainRecord(value.testCaseOrder)) {
    const perSuite: Record<string, number[]> = {};
    Object.entries(value.testCaseOrder).forEach(([rawSuiteId, rawIds]) => {
      const suiteId = typeof rawSuiteId === "string" ? rawSuiteId.trim() : "";
      if (suiteId.length === 0 || !Array.isArray(rawIds)) {
        return;
      }
      const seen = new Set<number>();
      const ordered: number[] = [];
      for (const entry of rawIds) {
        if (typeof entry !== "number" || !Number.isFinite(entry)) {
          continue;
        }
        if (!Number.isInteger(entry) || entry <= 0 || seen.has(entry)) {
          continue;
        }
        seen.add(entry);
        ordered.push(entry);
      }
      perSuite[suiteId] = ordered;
    });
    next.testCaseOrder = perSuite;
  }

  return next;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
