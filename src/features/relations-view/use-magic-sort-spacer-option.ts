import * as React from "react";

import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";
import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";

export type MagicSortSpacerOptionApi = {
  addSpacer: boolean;
  workItemPositions: Readonly<Record<number, number>>;
  setAddSpacer(next: boolean): void;
  applyVisiblePositions(visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>): void;
};

/** Owns the persisted per-set option and free vertical Bug slots for Magic Sort. */
export function useMagicSortSpacerOption(setId: string | null): MagicSortSpacerOptionApi {
  const [layout, setLayout] = React.useState(() => readLayoutForSet(setId));

  React.useEffect(() => {
    setLayout(readLayoutForSet(setId));
  }, [setId]);

  const save = React.useCallback((next: SetLayoutPreference) => {
    setLayout(next);
    if (setId) {
      setLayoutPreferenceStore.save(next, { scopeKey: setId });
    }
  }, [setId]);

  const setAddSpacer = React.useCallback((next: boolean) => {
    save({ ...readLayoutForSet(setId), magicSortAddSpacer: next });
  }, [save, setId]);

  const applyVisiblePositions = React.useCallback(
    (visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>) => {
      const currentLayout = readLayoutForSet(setId);
      const current = currentLayout.workItemSpacerPositions ?? {};
      const merged: Record<string, number> = { ...current };
      visibleIds.forEach((id) => {
        const position = nextPositions[id];
        if (position === undefined) {
          delete merged[String(id)];
        } else {
          merged[String(id)] = position;
        }
      });
      save({ ...currentLayout, workItemSpacerPositions: merged });
    },
    [save, setId]
  );

  return {
    addSpacer: layout.magicSortAddSpacer ?? false,
    workItemPositions: toNumericPositions(layout.workItemSpacerPositions),
    setAddSpacer,
    applyVisiblePositions
  };
}

function readLayoutForSet(setId: string | null): SetLayoutPreference {
  if (!setId) {
    return {};
  }
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? {};
}

function toNumericPositions(positions: Record<string, number> | undefined): Record<number, number> {
  const next: Record<number, number> = {};
  Object.entries(positions ?? {}).forEach(([rawId, position]) => {
    const id = Number(rawId);
    if (Number.isInteger(id) && id > 0) {
      next[id] = position;
    }
  });
  return next;
}
