import type { UserPreferencesClientPort } from "../../application/ports/client/user-preferences-client.port.js";
import {
  sanitizeUserPreferences,
  type UserPreferences
} from "../../shared/user-preferences/user-preferences.schema.js";

import { readCsrfTokenFromMeta } from "./csrf-token-reader.js";

const USER_PREFERENCES_ENDPOINT = "/phase2/user-preferences";
const ADO_CSRF_HEADER = "x-ado-csrf-token";

/**
 * HTTP-backed implementation of {@link UserPreferencesClientPort}.
 *
 * Owns the in-memory `UserPreferences` cache, deduplicates concurrent
 * hydrations and applies the same per-setId merge for `setLayouts` /
 * `setFilters` that the lowdb adapter performs server-side, so the cached
 * snapshot stays consistent across single-set patches.
 */
export class HttpUserPreferencesAdapter implements UserPreferencesClientPort {
  private cache: UserPreferences = {};
  private hydrated = false;
  private hydrationInFlight: Promise<UserPreferences> | null = null;

  public getCached(): UserPreferences {
    return this.cache;
  }

  public hydrate(): Promise<UserPreferences> {
    if (this.hydrated) {
      return Promise.resolve(this.cache);
    }
    if (this.hydrationInFlight) {
      return this.hydrationInFlight;
    }

    this.hydrationInFlight = this.loadFromServer()
      .then((next) => {
        this.cache = next;
        this.hydrated = true;
        return this.cache;
      })
      .catch(() => this.cache)
      .finally(() => {
        this.hydrationInFlight = null;
      });

    return this.hydrationInFlight;
  }

  public persistPatch(patch: Partial<UserPreferences>): void {
    const sanitizedPatch = sanitizeUserPreferences(patch);
    const layoutTouched = collectKeyedScopeIds(patch, "setLayouts");
    const filterTouched = collectKeyedScopeIds(patch, "setFilters");

    this.cache = {
      ...this.cache,
      ...sanitizedPatch,
      sets: sanitizedPatch.sets ?? this.cache.sets,
      setLayouts: mergeKeyedScope(this.cache.setLayouts, sanitizedPatch.setLayouts, layoutTouched),
      setFilters: mergeKeyedScope(this.cache.setFilters, sanitizedPatch.setFilters, filterTouched)
    };

    void this.postToServer(sanitizedPatch).catch(() => {
      // Local state stays even if the local server is briefly unreachable.
    });
  }

  /** Test-only: discards the in-memory cache so suites start from a clean slate. */
  public resetCacheForTests(): void {
    this.cache = {};
    this.hydrated = false;
    this.hydrationInFlight = null;
  }

  private async loadFromServer(): Promise<UserPreferences> {
    if (typeof fetch === "undefined") {
      return this.cache;
    }
    const response = await fetch(USER_PREFERENCES_ENDPOINT, {
      method: "GET",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return this.cache;
    }
    const payload = (await response.json()) as { preferences?: unknown };
    return sanitizeUserPreferences(payload.preferences);
  }

  private async postToServer(patch: UserPreferences): Promise<void> {
    if (typeof fetch === "undefined") {
      return;
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json"
    };
    const csrfToken = readCsrfTokenFromMeta();
    if (csrfToken) {
      headers[ADO_CSRF_HEADER] = csrfToken;
    }
    await fetch(USER_PREFERENCES_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ preferences: patch })
    });
  }
}

function collectKeyedScopeIds(
  rawPatch: Partial<UserPreferences>,
  field: "setLayouts" | "setFilters"
): Set<string> | null {
  const map = (rawPatch as Record<string, unknown>)[field];
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
