import * as React from "react";

import { ApiError, getAdoContext, setAdoContext, type AdoContext } from "../api/api-client.js";

export type AdoContextState = {
  context: AdoContext | null;
  hasContext: boolean;
  isLoading: boolean;
  error: string | null;
};

export type AdoContextApi = AdoContextState & {
  refresh(): Promise<void>;
  save(context: AdoContext): Promise<AdoContext>;
};

const INITIAL_STATE: AdoContextState = {
  context: null,
  hasContext: false,
  isLoading: true,
  error: null
};

/**
 * Reads + persists the local ADO organization/project, isolating the
 * `~/.azure-testops/ado-context.json` round-trip from any UI component.
 *
 * Why this lives in `set-management`: the only consumer in v1 is the
 * Set-Manager bootstrap step. If a second consumer surfaces, promote it to
 * `features/ado-context/`.
 */
export function useAdoContext(): AdoContextApi {
  const [state, setState] = React.useState<AdoContextState>(INITIAL_STATE);

  const refresh = React.useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const context = await getAdoContext();
      setState({
        context,
        hasContext: context !== null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setState({
        context: null,
        hasContext: false,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load ADO context."
      });
    }
  }, []);

  const save = React.useCallback<AdoContextApi["save"]>(async (context) => {
    try {
      const saved = await setAdoContext(context);
      setState({ context: saved, hasContext: true, isLoading: false, error: null });
      return saved;
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Failed to save context.";
      setState((current) => ({ ...current, error: message }));
      throw error;
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    save
  };
}
