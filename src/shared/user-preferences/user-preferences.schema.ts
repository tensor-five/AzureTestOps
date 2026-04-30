export type ThemeModePreference = "system" | "light" | "dark";

/**
 * Persisted layout per Set: item positions on the canvas plus collapsed Test Suite ids.
 * Filled in Phase 6 (RelationsView) — kept generic-record here so Phase 1 can persist
 * the schema envelope without locking the field shape too early.
 *
 * `workItemOrder` is the user-curated ordering of Work Items in the right
 * column (drag-and-drop reorder). Stored as the raw `WorkItem.id` sequence so
 * stale ids dropped from the active set survive a round-trip without
 * silently shifting the ordering of items still in the snapshot.
 */
export type SetLayoutPreference = {
  positions?: Record<string, { x: number; y: number }>;
  collapsedSuites?: string[];
  workItemOrder?: number[];
};

export type SetLayoutPreferencesBySetId = Record<string, SetLayoutPreference>;

/**
 * Persisted filter state per Set, split per column. The right column ("Work
 * Items") does not get an `lastOutcomes` axis — outcomes only exist on Test
 * Cases. Empty arrays / blank strings mean "no filter applied" and are
 * normalized away by the sanitizer so the on-disk file stays compact.
 */
export type TestCaseColumnFilterPreference = {
  titleQuery?: string;
  lastOutcomes?: string[];
  states?: string[];
  assignedTo?: string[];
  tags?: string[];
  workItemTypes?: string[];
};

export type WorkItemColumnFilterPreference = {
  titleQuery?: string;
  states?: string[];
  assignedTo?: string[];
  tags?: string[];
  workItemTypes?: string[];
};

export type SetFilterPreference = {
  testCases?: TestCaseColumnFilterPreference;
  workItems?: WorkItemColumnFilterPreference;
};

export type SetFiltersBySetId = Record<string, SetFilterPreference>;

/**
 * A Set bundles a Test Plan + root Suite + Saved Query into one switchable unit.
 * Phase 4 fills in the typed shape; until then the array is sanitized but the
 * inner objects are passed through opaquely.
 */
export type SetPreference = {
  id: string;
  name: string;
  planId: string;
  planName?: string;
  rootSuiteId: string;
  rootSuiteName?: string;
  queryId: string;
  queryName?: string;
  organization?: string;
  project?: string;
};

export type UserPreferences = {
  themeMode?: ThemeModePreference;
  sets?: SetPreference[];
  activeSetId?: string;
  setLayouts?: SetLayoutPreferencesBySetId;
  setFilters?: SetFiltersBySetId;
  updatedAt?: string;
};

export function sanitizeUserPreferences(value: unknown): UserPreferences {
  if (!isPlainRecord(value)) {
    return {};
  }

  const candidate = value;
  const next: UserPreferences = {};

  if (candidate.themeMode === "system" || candidate.themeMode === "light" || candidate.themeMode === "dark") {
    next.themeMode = candidate.themeMode;
  }

  if (Array.isArray(candidate.sets)) {
    const deduped = new Map<string, SetPreference>();
    candidate.sets.forEach((entry) => {
      const set = sanitizeSetPreference(entry);
      if (set && !deduped.has(set.id)) {
        deduped.set(set.id, set);
      }
    });
    if (deduped.size > 0) {
      next.sets = [...deduped.values()];
    }
  }

  if (typeof candidate.activeSetId === "string") {
    const id = candidate.activeSetId.trim();
    if (id.length > 0) {
      next.activeSetId = id;
    }
  }

  if (isPlainRecord(candidate.setLayouts)) {
    const sanitized: SetLayoutPreferencesBySetId = {};
    Object.entries(candidate.setLayouts).forEach(([setId, layout]) => {
      const trimmedSetId = setId.trim();
      if (trimmedSetId.length === 0) {
        return;
      }
      const sanitizedLayout = sanitizeSetLayoutPreference(layout);
      if (sanitizedLayout) {
        sanitized[trimmedSetId] = sanitizedLayout;
      }
    });
    if (Object.keys(sanitized).length > 0) {
      next.setLayouts = sanitized;
    }
  }

  if (isPlainRecord(candidate.setFilters)) {
    const sanitized: SetFiltersBySetId = {};
    Object.entries(candidate.setFilters).forEach(([setId, filterState]) => {
      const trimmedSetId = setId.trim();
      if (trimmedSetId.length === 0) {
        return;
      }
      const sanitizedFilter = sanitizeSetFilterPreference(filterState);
      if (sanitizedFilter) {
        sanitized[trimmedSetId] = sanitizedFilter;
      }
    });
    // Preserve an explicitly-empty map so a "clear-last-filter" patch can
    // overwrite the current state instead of being treated as "no change".
    next.setFilters = sanitized;
  }

  if (typeof candidate.updatedAt === "string") {
    next.updatedAt = candidate.updatedAt;
  }

  return next;
}

export function sanitizeSetPreference(value: unknown): SetPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const id = readNonEmptyString(value.id);
  const planId = readNonEmptyString(value.planId);
  const rootSuiteId = readNonEmptyString(value.rootSuiteId);
  const queryId = readNonEmptyString(value.queryId);

  if (!id || !planId || !rootSuiteId || !queryId) {
    return null;
  }

  return {
    id,
    name: readNonEmptyString(value.name) ?? id,
    planId,
    planName: readNonEmptyString(value.planName),
    rootSuiteId,
    rootSuiteName: readNonEmptyString(value.rootSuiteName),
    queryId,
    queryName: readNonEmptyString(value.queryName),
    organization: readNonEmptyString(value.organization),
    project: readNonEmptyString(value.project)
  };
}

export function sanitizeSetFilterPreference(value: unknown): SetFilterPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: SetFilterPreference = {};

  const testCases = sanitizeTestCaseColumnFilter(value.testCases);
  if (testCases) {
    next.testCases = testCases;
  }

  const workItems = sanitizeWorkItemColumnFilter(value.workItems);
  if (workItems) {
    next.workItems = workItems;
  }

  return Object.keys(next).length === 0 ? null : next;
}

function sanitizeTestCaseColumnFilter(
  value: unknown
): TestCaseColumnFilterPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: TestCaseColumnFilterPreference = {};
  applyTitleQuery(next, value.titleQuery);
  applyStringList(next, "lastOutcomes", value.lastOutcomes);
  applyStringList(next, "states", value.states);
  applyStringList(next, "assignedTo", value.assignedTo);
  applyStringList(next, "tags", value.tags);
  applyStringList(next, "workItemTypes", value.workItemTypes);

  return Object.keys(next).length === 0 ? null : next;
}

function sanitizeWorkItemColumnFilter(
  value: unknown
): WorkItemColumnFilterPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: WorkItemColumnFilterPreference = {};
  applyTitleQuery(next, value.titleQuery);
  applyStringList(next, "states", value.states);
  applyStringList(next, "assignedTo", value.assignedTo);
  applyStringList(next, "tags", value.tags);
  applyStringList(next, "workItemTypes", value.workItemTypes);

  return Object.keys(next).length === 0 ? null : next;
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

function sanitizeSetLayoutPreference(value: unknown): SetLayoutPreference | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const next: SetLayoutPreference = {};

  if (isPlainRecord(value.positions)) {
    const positions: Record<string, { x: number; y: number }> = {};
    Object.entries(value.positions).forEach(([workItemId, position]) => {
      const trimmedKey = workItemId.trim();
      if (trimmedKey.length === 0 || !isPlainRecord(position)) {
        return;
      }
      const x = readFiniteNumber(position.x);
      const y = readFiniteNumber(position.y);
      if (x === null || y === null) {
        return;
      }
      positions[trimmedKey] = { x, y };
    });
    if (Object.keys(positions).length > 0) {
      next.positions = positions;
    }
  }

  if (Array.isArray(value.collapsedSuites)) {
    const collapsed = [...new Set(value.collapsedSuites)]
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    if (collapsed.length > 0) {
      next.collapsedSuites = collapsed;
    }
  }

  if (Array.isArray(value.workItemOrder)) {
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const entry of value.workItemOrder) {
      const id = readPositiveInteger(entry);
      if (id === null || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ordered.push(id);
    }
    if (ordered.length > 0) {
      next.workItemOrder = ordered;
    }
  }

  if (Object.keys(next).length === 0) {
    return null;
  }

  return next;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
