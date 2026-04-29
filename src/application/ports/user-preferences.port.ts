import type { UserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";

/**
 * Persistence boundary for the per-user `UserPreferences` envelope (themeMode,
 * sets, set layouts, set filters). Implemented by the lowdb adapter today —
 * the port keeps the application layer agnostic of the storage technology.
 *
 * `mergePreferences` is for shallow patches from the UI;
 * `updatePreferences` exposes an atomic read-modify-write hook for adapters
 * that need to maintain invariants across nested fields (e.g. cascading
 * `setLayouts` / `setFilters` when a Set is deleted).
 */
export interface UserPreferencesPort {
  getPreferences(): Promise<UserPreferences>;
  mergePreferences(patch: UserPreferences): Promise<UserPreferences>;
  updatePreferences(
    updater: (current: UserPreferences) => UserPreferences
  ): Promise<UserPreferences>;
}
