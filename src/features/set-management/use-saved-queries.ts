import * as React from "react";

import { ApiError, listSavedQueries } from "../api/api-client.js";
import type { SavedQuery } from "../../domain/queries/saved-query.js";

export type SavedQueriesState = {
  queries: SavedQuery[];
  isLoading: boolean;
  needsContext: boolean;
  error: string | null;
};

export type SavedQueriesApi = SavedQueriesState & {
  refresh(): Promise<void>;
};

const INITIAL_STATE: SavedQueriesState = {
  queries: [],
  isLoading: false,
  needsContext: false,
  error: null
};

/**
 * Lazy fetch of `Shared Queries` leaves for the Set-creation picker.
 *
 * Mirrors {@link useTestPlanCatalog} in surfacing `needsContext: true`
 * instead of an error when the local server returns 412 — the dialog then
 * renders the ADO-context bootstrap step rather than a red banner.
 */
export function useSavedQueries(): SavedQueriesApi {
  const [state, setState] = React.useState<SavedQueriesState>(INITIAL_STATE);

  const refresh = React.useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const queries = await listSavedQueries();
      setState({ queries, isLoading: false, needsContext: false, error: null });
    } catch (error) {
      if (error instanceof ApiError && error.code === "ADO_CONTEXT_NOT_CONFIGURED") {
        setState({ queries: [], isLoading: false, needsContext: true, error: null });
        return;
      }
      setState({
        queries: [],
        isLoading: false,
        needsContext: false,
        error: error instanceof Error ? error.message : "Failed to load saved queries."
      });
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
