import type { UserPreferences } from "../../../shared/user-preferences/user-preferences.schema.js";

export type UserPreferencesClientOperation = "load" | "save";
export type UserPreferencesSaveStatusListener = (
  error: UserPreferencesClientError | null
) => void;

/**
 * Domain-facing failure raised by a preferences adapter after transport
 * details have been translated into an actionable application message.
 */
export class UserPreferencesClientError extends Error {
  public readonly operation: UserPreferencesClientOperation;

  public constructor(
    operation: UserPreferencesClientOperation,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "UserPreferencesClientError";
    this.operation = operation;
  }
}

/**
 * Browser-facing port for the lowdb-backed `UserPreferences` envelope.
 *
 * Encapsulates the in-memory cache, the hydration round-trip and the
 * patch-and-POST flow so feature stores stay transport-agnostic. The cache is
 * authoritative for synchronous reads; `hydrate()` populates it from the
 * server, `persistPatch()` updates it optimistically and forwards to the
 * server in the background.
 */
export interface UserPreferencesClientPort {
  /**
   * Returns the cached preferences snapshot. Returns `{}` before the first
   * successful hydration so callers can render with sensible defaults
   * without awaiting the round-trip.
   */
  getCached(): UserPreferences;
  /**
   * Loads the persisted preferences from the server once and caches them.
   * Subsequent calls resolve to the cached value without re-fetching.
   * Concurrent calls share one in-flight request.
   */
  hydrate(): Promise<UserPreferences>;
  /**
   * Updates the cache synchronously with the sanitized patch and POSTs the
   * same patch to the server. The returned promise settles when this queued
   * write has completed so the application can surface persistence failures.
   * After a failure, the next successful write must also reconcile the
   * previously unsaved optimistic cache state before resolving.
   */
  persistPatch(patch: Partial<UserPreferences>): Promise<void>;
  /**
   * Optional status stream for adapter-owned background reconciliation that
   * is not represented by a later caller-owned persist promise.
   */
  subscribeSaveStatus?(listener: UserPreferencesSaveStatusListener): () => void;
}
