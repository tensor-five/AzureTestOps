import * as React from "react";

import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";
import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";

export type SuiteDisplayOptionsApi = {
  hideEmptySuites: boolean;
  setHideEmptySuites(next: boolean): void;
};

/** Persists suite-explorer display options per set through the shared layout store. */
export function useSuiteDisplayOptions(setId: string | null): SuiteDisplayOptionsApi {
  const [hideEmptySuites, setHideEmptySuitesState] = React.useState(() =>
    readLayoutForSet(setId)?.hideEmptySuites ?? false
  );

  React.useEffect(() => {
    setHideEmptySuitesState(readLayoutForSet(setId)?.hideEmptySuites ?? false);
  }, [setId]);

  const setHideEmptySuites = React.useCallback(
    (next: boolean) => {
      setHideEmptySuitesState(next);
      if (!setId) {
        return;
      }
      const current = readLayoutForSet(setId) ?? {};
      const merged: SetLayoutPreference = { ...current, hideEmptySuites: next };
      setLayoutPreferenceStore.save(merged, { scopeKey: setId });
    },
    [setId]
  );

  return { hideEmptySuites, setHideEmptySuites };
}

function readLayoutForSet(setId: string | null): SetLayoutPreference | undefined {
  if (!setId) {
    return undefined;
  }
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? undefined;
}
