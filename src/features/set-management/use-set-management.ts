import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import type { Set, SetDraft } from "../../domain/sets/set.js";

export type SetManagementState = {
  sets: Set[];
  activeSetId: string | null;
  isLoading: boolean;
  error: string | null;
};

export type SetManagementApi = SetManagementState & {
  refresh(): Promise<void>;
  create(draft: SetDraft & { setActive?: boolean }): Promise<Set>;
  update(setId: string, patch: Partial<SetDraft>): Promise<Set>;
  remove(setId: string): Promise<void>;
  setActive(setId: string | null): Promise<void>;
};

/**
 * Owns the set list + active-set pointer for the UI. Keeps a single source of
 * truth in component state — mutations go through the
 * {@link SetManagementClientPort} (resolved from {@link useClientPorts}) and
 * then mirror back into local state so the dropdown / dialog reflect the
 * server response without an extra round-trip.
 */
export function useSetManagement(): SetManagementApi {
  const { setManagement } = useClientPorts();
  const [state, setState] = React.useState<SetManagementState>({
    sets: [],
    activeSetId: null,
    isLoading: true,
    error: null
  });

  const refresh = React.useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const result = await setManagement.list();
      setState({
        sets: result.sets,
        activeSetId: result.activeSetId,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load sets."
      }));
    }
  }, [setManagement]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = React.useCallback<SetManagementApi["create"]>(
    async (draft) => {
      const created = await setManagement.create(draft);
      setState((current) => ({
        ...current,
        sets: [...current.sets, created],
        activeSetId: draft.setActive ? created.id : current.activeSetId,
        error: null
      }));
      return created;
    },
    [setManagement]
  );

  const update = React.useCallback<SetManagementApi["update"]>(
    async (setId, patch) => {
      const updated = await setManagement.update(setId, patch);
      setState((current) => ({
        ...current,
        sets: current.sets.map((entry) => (entry.id === setId ? updated : entry)),
        error: null
      }));
      return updated;
    },
    [setManagement]
  );

  const remove = React.useCallback<SetManagementApi["remove"]>(
    async (setId) => {
      await setManagement.delete(setId);
      setState((current) => ({
        ...current,
        sets: current.sets.filter((entry) => entry.id !== setId),
        activeSetId: current.activeSetId === setId ? null : current.activeSetId,
        error: null
      }));
    },
    [setManagement]
  );

  const setActive = React.useCallback<SetManagementApi["setActive"]>(
    async (setId) => {
      await setManagement.setActive(setId);
      setState((current) => ({ ...current, activeSetId: setId, error: null }));
    },
    [setManagement]
  );

  return {
    sets: state.sets,
    activeSetId: state.activeSetId,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    create,
    update,
    remove,
    setActive
  };
}
