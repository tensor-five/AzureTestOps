import { randomUUID } from "node:crypto";

import type { Set, SetDraft } from "../../../domain/sets/set.js";
import type { SetRepositoryPort } from "../../../application/ports/set-repository.port.js";
import type { UserPreferencesPort } from "../../../application/ports/user-preferences.port.js";
import type {
  SetPreference,
  UserPreferences
} from "../../../shared/user-preferences/user-preferences.schema.js";

export type LowdbSetRepositoryDeps = {
  preferences: UserPreferencesPort;
  /** Defaults to `crypto.randomUUID()`. Injectable for deterministic tests. */
  generateId?: () => string;
};

/**
 * Lowdb-backed implementation of {@link SetRepositoryPort}.
 *
 * Sets, the active-set pointer, layouts and filters all live inside the same
 * per-user `UserPreferences` envelope, so we delegate to
 * {@link UserPreferencesPort#updatePreferences} for atomic read-modify-write.
 */
export class LowdbSetRepository implements SetRepositoryPort {
  private readonly preferences: UserPreferencesPort;
  private readonly generateId: () => string;

  public constructor(deps: LowdbSetRepositoryDeps) {
    this.preferences = deps.preferences;
    this.generateId = deps.generateId ?? randomUUID;
  }

  public async listSets(): Promise<Set[]> {
    const prefs = await this.preferences.getPreferences();
    return readSets(prefs).map(toDomain);
  }

  public async getById(setId: string): Promise<Set | null> {
    const prefs = await this.preferences.getPreferences();
    const found = readSets(prefs).find((entry) => entry.id === setId);
    return found ? toDomain(found) : null;
  }

  public async create(draft: SetDraft, options?: { id?: string }): Promise<Set> {
    const id = (options?.id ?? this.generateId()).trim();
    if (id.length === 0) {
      throw new Error("LowdbSetRepository.create: generated id is empty");
    }
    const candidate = toPreference({ ...draft, id });

    let created: SetPreference | null = null;
    await this.preferences.updatePreferences((current) => {
      const sets = readSets(current);
      if (sets.some((entry) => entry.id === id)) {
        throw new Error(`LowdbSetRepository.create: set "${id}" already exists`);
      }
      created = candidate;
      return { ...current, sets: [...sets, candidate] };
    });

    if (!created) {
      // updatePreferences swallows nothing; keep the type-checker happy.
      throw new Error("LowdbSetRepository.create: write did not commit");
    }
    return toDomain(created);
  }

  public async update(setId: string, patch: Partial<SetDraft>): Promise<Set> {
    let updated: SetPreference | null = null;

    await this.preferences.updatePreferences((current) => {
      const sets = readSets(current);
      const index = sets.findIndex((entry) => entry.id === setId);
      if (index === -1) {
        throw new Error(`LowdbSetRepository.update: set "${setId}" not found`);
      }

      const merged = mergeSetPatch(sets[index], patch);
      updated = merged;

      const nextSets = [...sets];
      nextSets[index] = merged;
      return { ...current, sets: nextSets };
    });

    if (!updated) {
      throw new Error("LowdbSetRepository.update: write did not commit");
    }
    return toDomain(updated);
  }

  public async delete(setId: string): Promise<void> {
    await this.preferences.updatePreferences((current) => {
      const sets = readSets(current).filter((entry) => entry.id !== setId);
      const next: UserPreferences = { ...current, sets };

      if (current.activeSetId === setId) {
        delete next.activeSetId;
      }

      if (current.setLayouts && setId in current.setLayouts) {
        const { [setId]: _omitLayout, ...remainingLayouts } = current.setLayouts;
        next.setLayouts = remainingLayouts;
      }

      if (current.setFilters && setId in current.setFilters) {
        const { [setId]: _omitFilters, ...remainingFilters } = current.setFilters;
        next.setFilters = remainingFilters;
      }

      return next;
    });
  }

  public async getActiveId(): Promise<string | null> {
    const prefs = await this.preferences.getPreferences();
    const activeId = prefs.activeSetId;
    if (!activeId) {
      return null;
    }
    const sets = readSets(prefs);
    return sets.some((entry) => entry.id === activeId) ? activeId : null;
  }

  public async setActiveId(setId: string | null): Promise<void> {
    await this.preferences.updatePreferences((current) => {
      const next: UserPreferences = { ...current };
      if (setId === null) {
        delete next.activeSetId;
        return next;
      }

      const sets = readSets(current);
      if (!sets.some((entry) => entry.id === setId)) {
        throw new Error(`LowdbSetRepository.setActiveId: set "${setId}" not found`);
      }
      next.activeSetId = setId;
      return next;
    });
  }
}

function readSets(prefs: UserPreferences): SetPreference[] {
  return prefs.sets ?? [];
}

function toDomain(entry: SetPreference): Set {
  const next: Set = {
    id: entry.id,
    name: entry.name,
    planId: entry.planId,
    rootSuiteId: entry.rootSuiteId,
    queryId: entry.queryId
  };
  if (entry.planName !== undefined) next.planName = entry.planName;
  if (entry.rootSuiteName !== undefined) next.rootSuiteName = entry.rootSuiteName;
  if (entry.queryName !== undefined) next.queryName = entry.queryName;
  if (entry.organization !== undefined) next.organization = entry.organization;
  if (entry.project !== undefined) next.project = entry.project;
  return next;
}

function toPreference(set: Set): SetPreference {
  const next: SetPreference = {
    id: set.id,
    name: set.name,
    planId: set.planId,
    rootSuiteId: set.rootSuiteId,
    queryId: set.queryId
  };
  if (set.planName !== undefined) next.planName = set.planName;
  if (set.rootSuiteName !== undefined) next.rootSuiteName = set.rootSuiteName;
  if (set.queryName !== undefined) next.queryName = set.queryName;
  if (set.organization !== undefined) next.organization = set.organization;
  if (set.project !== undefined) next.project = set.project;
  return next;
}

function mergeSetPatch(current: SetPreference, patch: Partial<SetDraft>): SetPreference {
  return toPreference({
    id: current.id,
    name: patch.name ?? current.name,
    planId: patch.planId ?? current.planId,
    planName: patch.planName ?? current.planName,
    rootSuiteId: patch.rootSuiteId ?? current.rootSuiteId,
    rootSuiteName: patch.rootSuiteName ?? current.rootSuiteName,
    queryId: patch.queryId ?? current.queryId,
    queryName: patch.queryName ?? current.queryName,
    organization: patch.organization ?? current.organization,
    project: patch.project ?? current.project
  });
}
