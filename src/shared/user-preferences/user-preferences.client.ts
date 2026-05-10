import type { UserPreferencesClientPort } from "../../application/ports/client/user-preferences-client.port.js";

import type { UserPreferences } from "./user-preferences.schema.js";

export type {
  SetFilterPreference,
  SetFiltersBySetId,
  SetLayoutPreference,
  SetLayoutPreferencesBySetId,
  SetPreference,
  TestCaseColumnFilterPreference,
  ThemeModePreference,
  UserPreferences,
  WorkItemColumnFilterPreference
} from "./user-preferences.schema.js";

/**
 * Module-level facade over {@link UserPreferencesClientPort}.
 *
 * Feature stores were created at import time long before client ports existed,
 * so they reach for these top-level functions instead of `useClientPorts()`.
 * The composition root calls {@link installUserPreferencesPort} on startup;
 * tests can install a stub port (or rely on `vi.spyOn` to intercept the
 * facade exports directly).
 *
 * Until a port is installed, calls fall back to the no-op port so feature
 * code never observes `undefined` reads — this matches the pre-port behaviour
 * where the cache simply started empty before hydration.
 */
let installedPort: UserPreferencesClientPort = createNoopPort();

export function installUserPreferencesPort(port: UserPreferencesClientPort): void {
  installedPort = port;
}

export function getCachedUserPreferences(): UserPreferences {
  return installedPort.getCached();
}

export async function hydrateUserPreferences(): Promise<UserPreferences> {
  return installedPort.hydrate();
}

export function persistUserPreferencesPatch(patch: Partial<UserPreferences>): void {
  installedPort.persistPatch(patch);
}

/**
 * Test seam. Resets the installed port to the no-op default so a fresh suite
 * does not carry cache state from a previous test.
 */
export function resetUserPreferencesCacheForTests(): void {
  installedPort = createNoopPort();
}

function createNoopPort(): UserPreferencesClientPort {
  return {
    getCached: () => ({}),
    hydrate: () => Promise.resolve({}),
    persistPatch: () => {
      // no-op until a real adapter is installed
    }
  };
}
