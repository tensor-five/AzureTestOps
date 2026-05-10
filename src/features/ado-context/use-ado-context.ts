import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import { ApiError } from "../../application/dto/api-error.js";
import type { AdoContext } from "../../application/ports/ado-context.port.js";

export type { AdoContext };

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
 * Reads and persists the local ADO organization/project through the
 * lowdb-backed user preferences endpoint.
 */
export function useAdoContext(): AdoContextApi {
  const { adoContext } = useClientPorts();
  const [state, setState] = React.useState<AdoContextState>(INITIAL_STATE);

  const refresh = React.useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const context = await adoContext.getContext();
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
  }, [adoContext]);

  const save = React.useCallback<AdoContextApi["save"]>(
    async (context) => {
      try {
        const saved = await adoContext.setContext(context);
        setState({ context: saved, hasContext: true, isLoading: false, error: null });
        return saved;
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to save context.";
        setState((current) => ({ ...current, error: message }));
        throw error;
      }
    },
    [adoContext]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    save
  };
}
