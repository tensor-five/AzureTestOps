import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Low } from "lowdb";
import { JSONFilePreset } from "lowdb/node";

import type { UserPreferencesPort } from "../../../application/ports/user-preferences.port.js";
import {
  sanitizeUserPreferences,
  type UserPreferences
} from "../../../shared/user-preferences/user-preferences.schema.js";

export type { UserPreferences } from "../../../shared/user-preferences/user-preferences.schema.js";

type PersistedPreferencesDb = {
  version: 1;
  users: Record<string, UserPreferences>;
};

function defaultDb(): PersistedPreferencesDb {
  return { version: 1, users: {} };
}

export class LowdbUserPreferencesAdapter implements UserPreferencesPort {
  private dbPromise: Promise<Low<PersistedPreferencesDb>> | null = null;

  public constructor(
    private readonly filePath: string,
    private readonly userId: string
  ) {}

  public async getPreferences(): Promise<UserPreferences> {
    const db = await this.getDb();
    const existing = db.data.users[this.userId];

    if (!existing) {
      return {};
    }

    return sanitizeUserPreferences(existing);
  }

  public async mergePreferences(patch: UserPreferences): Promise<UserPreferences> {
    const db = await this.getDb();
    const incoming = sanitizeUserPreferences(patch);

    // setLayouts / setFilters are keyed by setId. A naive shallow merge would
    // let a single-set patch wipe out every other set's persisted entry. We
    // walk the raw patch to learn which setIds the caller intended to touch:
    //   - present in raw patch + survives sanitize → upsert
    //   - present in raw patch + sanitized away    → delete (empty/clear intent)
    //   - absent from raw patch                    → leave current entry untouched
    const layoutTouched = collectKeyedScopeIds(patch, "setLayouts");
    const filterTouched = collectKeyedScopeIds(patch, "setFilters");

    await db.update((data) => {
      const current = sanitizeUserPreferences(data.users[this.userId] ?? {});
      data.users[this.userId] = {
        ...current,
        ...incoming,
        sets: incoming.sets ?? current.sets,
        setLayouts: mergeKeyedScope(current.setLayouts, incoming.setLayouts, layoutTouched),
        setFilters: mergeKeyedScope(current.setFilters, incoming.setFilters, filterTouched),
        updatedAt: new Date().toISOString()
      };
    });

    return sanitizeUserPreferences(db.data.users[this.userId] ?? {});
  }

  /**
   * Atomic read-modify-write. The updater receives the sanitized current
   * preferences and must return the desired full state — fields it omits are
   * dropped (use {@link mergePreferences} for partial patches).
   */
  public async updatePreferences(
    updater: (current: UserPreferences) => UserPreferences
  ): Promise<UserPreferences> {
    const db = await this.getDb();

    await db.update((data) => {
      const current = sanitizeUserPreferences(data.users[this.userId] ?? {});
      const next = sanitizeUserPreferences(updater(current));
      data.users[this.userId] = {
        ...next,
        updatedAt: new Date().toISOString()
      };
    });

    return sanitizeUserPreferences(db.data.users[this.userId] ?? {});
  }

  private async getDb(): Promise<Low<PersistedPreferencesDb>> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = (async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const db = await JSONFilePreset<PersistedPreferencesDb>(this.filePath, defaultDb());

      if (!isValidDb(db.data)) {
        db.data = defaultDb();
        await db.write();
      }

      return db;
    })();

    return this.dbPromise;
  }
}

function collectKeyedScopeIds(
  rawPatch: unknown,
  field: "setLayouts" | "setFilters"
): Set<string> | null {
  if (!isPlainRecord(rawPatch)) {
    return null;
  }
  const map = rawPatch[field];
  if (!isPlainRecord(map)) {
    return null;
  }
  const ids = new Set<string>();
  for (const key of Object.keys(map)) {
    const trimmed = key.trim();
    if (trimmed.length > 0) {
      ids.add(trimmed);
    }
  }
  return ids;
}

function mergeKeyedScope<T>(
  current: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined,
  touched: Set<string> | null
): Record<string, T> | undefined {
  if (touched === null) {
    return current;
  }
  const next: Record<string, T> = { ...(current ?? {}) };
  for (const setId of touched) {
    const value = incoming?.[setId];
    if (value === undefined) {
      delete next[setId];
    } else {
      next[setId] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function isValidDb(value: unknown): value is PersistedPreferencesDb {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) {
    return false;
  }

  if (!isPlainRecord(candidate.users)) {
    return false;
  }

  return Object.values(candidate.users).every((entry) => !!entry && typeof entry === "object");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
