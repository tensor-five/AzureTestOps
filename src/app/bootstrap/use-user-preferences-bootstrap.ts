import * as React from "react";

import {
  getUserPreferencesSyncStatus,
  hydrateUserPreferences,
  subscribeUserPreferencesSyncStatus,
  type UserPreferencesSyncStatus
} from "../../shared/user-preferences/user-preferences.client.js";
import type { UserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";

export type UserPreferencesBootstrapState = {
  preferences: UserPreferences | null;
  syncStatus: UserPreferencesSyncStatus;
};

/** Gates preference consumers until lowdb hydration or its local fallback completes. */
export function useUserPreferencesBootstrap(): UserPreferencesBootstrapState {
  const [preferences, setPreferences] = React.useState<UserPreferences | null>(null);
  const syncStatus = React.useSyncExternalStore(
    subscribeUserPreferencesSyncStatus,
    getUserPreferencesSyncStatus,
    getUserPreferencesSyncStatus
  );

  React.useEffect(() => {
    let active = true;
    void hydrateUserPreferences().then((hydrated) => {
      if (active) {
        setPreferences(hydrated);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { preferences, syncStatus };
}
