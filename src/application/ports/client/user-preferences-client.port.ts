import type { UserPreferences } from "../../../shared/user-preferences/user-preferences.schema.js";

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
   * same patch to the server. Failures are swallowed so transient network
   * issues don't surface as render errors.
   */
  persistPatch(patch: Partial<UserPreferences>): void;
}
