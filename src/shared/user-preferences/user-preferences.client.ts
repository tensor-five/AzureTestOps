import {
  UserPreferencesClientError,
  type UserPreferencesClientPort
} from "../../application/ports/client/user-preferences-client.port.js";

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
let unsubscribeInstalledSaveStatus: (() => void) | null = null;
let syncStatus: UserPreferencesSyncStatus = createIdleSyncStatus();
let cacheHydrationState: "idle" | "authoritative" | "fallback" = "idle";
let hydrationInFlight: Promise<UserPreferences> | null = null;
const syncStatusListeners = new Set<() => void>();

export type UserPreferencesSyncStatus = {
  loadError: string | null;
  saveError: string | null;
};

export function installUserPreferencesPort(port: UserPreferencesClientPort): void {
  if (installedPort === port) {
    return;
  }
  unsubscribeInstalledSaveStatus?.();
  installedPort = port;
  cacheHydrationState = "idle";
  hydrationInFlight = null;
  unsubscribeInstalledSaveStatus = port.subscribeSaveStatus?.((error) => {
    if (error) {
      publishSaveError(error);
    } else {
      publishSyncStatus({ ...syncStatus, saveError: null });
    }
  }) ?? null;
}

export function getCachedUserPreferences(): UserPreferences {
  return installedPort.getCached();
}

/**
 * Reports whether the installed cache was populated by a successful lowdb
 * hydration. Before hydration, or after a failed hydration, feature stores
 * may still use their localStorage compatibility fallback.
 */
export function isUserPreferencesCacheAuthoritative(): boolean {
  return cacheHydrationState === "authoritative";
}

export function hydrateUserPreferences(): Promise<UserPreferences> {
  if (cacheHydrationState !== "idle") {
    return Promise.resolve(installedPort.getCached());
  }
  if (hydrationInFlight) {
    return hydrationInFlight;
  }

  const hydratingPort = installedPort;
  hydrationInFlight = hydratingPort.hydrate()
    .then((preferences) => {
      if (installedPort === hydratingPort) {
        cacheHydrationState = "authoritative";
        publishSyncStatus({ ...syncStatus, loadError: null });
      }
      return preferences;
    })
    .catch((error: unknown) => {
      if (installedPort === hydratingPort) {
        cacheHydrationState = "fallback";
        publishSyncStatus({
          ...syncStatus,
          loadError: toApplicationMessage(error, "load")
        });
      }
      return hydratingPort.getCached();
    })
    .finally(() => {
      if (installedPort === hydratingPort) {
        hydrationInFlight = null;
      }
    });
  return hydrationInFlight;
}

export function persistUserPreferencesPatch(patch: Partial<UserPreferences>): void {
  let persistence: Promise<void>;
  try {
    persistence = installedPort.persistPatch(patch);
  } catch (error: unknown) {
    publishSaveError(error);
    return;
  }

  void persistence
    .then(() => publishSyncStatus({ ...syncStatus, saveError: null }))
    .catch(publishSaveError);
}

export function getUserPreferencesSyncStatus(): UserPreferencesSyncStatus {
  return syncStatus;
}

export function subscribeUserPreferencesSyncStatus(listener: () => void): () => void {
  syncStatusListeners.add(listener);
  return () => syncStatusListeners.delete(listener);
}

/**
 * Test seam. Resets the installed port to the no-op default so a fresh suite
 * does not carry cache state from a previous test.
 */
export function resetUserPreferencesCacheForTests(): void {
  unsubscribeInstalledSaveStatus?.();
  unsubscribeInstalledSaveStatus = null;
  installedPort = createNoopPort();
  cacheHydrationState = "idle";
  hydrationInFlight = null;
  publishSyncStatus(createIdleSyncStatus());
}

function createNoopPort(): UserPreferencesClientPort {
  return {
    getCached: () => ({}),
    hydrate: () => Promise.resolve({}),
    persistPatch: () => Promise.resolve()
  };
}

function publishSyncStatus(next: UserPreferencesSyncStatus): void {
  if (syncStatus.loadError === next.loadError && syncStatus.saveError === next.saveError) {
    return;
  }
  syncStatus = next;
  syncStatusListeners.forEach((listener) => listener());
}

function createIdleSyncStatus(): UserPreferencesSyncStatus {
  return { loadError: null, saveError: null };
}

function publishSaveError(error: unknown): void {
  publishSyncStatus({
    ...syncStatus,
    saveError: toApplicationMessage(error, "save")
  });
}

function toApplicationMessage(error: unknown, operation: "load" | "save"): string {
  if (error instanceof UserPreferencesClientError) {
    return error.message;
  }
  return operation === "load"
    ? "Settings could not be loaded. Local browser settings are being used."
    : "Settings could not be saved permanently. Your changes remain available in this browser.";
}
