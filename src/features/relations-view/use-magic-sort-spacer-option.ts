import * as React from "react";

import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";
import { setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import {
  migrateSpacerPositions,
  moveWorkItemIntoSpacerSlot,
  normalizeWorkItemSpacerLayout,
  positionsFromSpacerLayout,
  completeWorkItemSpacerLayout,
  replaceVisibleSpacerPositions,
  type WorkItemSpacerToken
} from "./work-item-spacer-layout.js";

export type MagicSortSpacerOptionApi = {
  addSpacer: boolean;
  workItemPositions: Readonly<Record<number, number>>;
  spacerLayout: readonly WorkItemSpacerToken[];
  setAddSpacer(next: boolean): void;
  applyVisiblePositions(visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>, options?: { compact: boolean }): void;
  moveVisibleWorkItemToSpacerSlot(sourceWorkItemId: number, targetTokenIndex: number): void;
};

/** Owns the persisted per-set option and free vertical Bug slots for Magic Sort. */
export function useMagicSortSpacerOption(setId: string | null, workItemIds: readonly number[] = []): MagicSortSpacerOptionApi {
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
    (visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>, options?: { compact: boolean }) => {
      const currentLayout = readLayoutForSet(setId);
      const next = replaceVisibleSpacerPositions(completeWorkItemSpacerLayout(materializeLayout(currentLayout), workItemIds), visibleIds, nextPositions, !options?.compact);
      save({ ...currentLayout, workItemSpacerLayout: next, workItemSpacerPositions: toStringPositions(next) });
    },
    [save, setId, workItemIds]
  );

  const moveVisibleWorkItemToSpacerSlot = React.useCallback((sourceWorkItemId: number, targetTokenIndex: number) => {
    const currentLayout = readLayoutForSet(setId);
    const next = moveWorkItemIntoSpacerSlot(completeWorkItemSpacerLayout(materializeLayout(currentLayout), workItemIds), sourceWorkItemId, targetTokenIndex);
    save({ ...currentLayout, workItemSpacerLayout: next, workItemSpacerPositions: toStringPositions(next) });
  }, [save, setId, workItemIds]);

  const spacerLayout = completeWorkItemSpacerLayout(materializeLayout(layout), workItemIds);

  return {
    addSpacer: layout.magicSortAddSpacer ?? false,
    workItemPositions: positionsFromSpacerLayout(spacerLayout),
    spacerLayout,
    setAddSpacer,
    applyVisiblePositions,
    moveVisibleWorkItemToSpacerSlot
  };
}

function readLayoutForSet(setId: string | null): SetLayoutPreference {
  if (!setId) {
    return {};
  }
  return setLayoutPreferenceStore.load({ scopeKey: setId }) ?? {};
}

function materializeLayout(layout: SetLayoutPreference): WorkItemSpacerToken[] {
  return layout.workItemSpacerLayout
    ? normalizeWorkItemSpacerLayout(layout.workItemSpacerLayout)
    : migrateSpacerPositions(toNumericPositions(layout.workItemSpacerPositions));
}

function toNumericPositions(positions: Record<string, number> | undefined): Record<number, number> {
  return Object.fromEntries(Object.entries(positions ?? []).flatMap(([rawId, position]) => {
    const id = Number(rawId);
    return Number.isInteger(id) && id > 0 ? [[id, position]] : [];
  }));
}

function toStringPositions(layout: readonly WorkItemSpacerToken[]): Record<string, number> {
  return Object.fromEntries(Object.entries(positionsFromSpacerLayout(layout)).map(([id, position]) => [id, position]));
}
