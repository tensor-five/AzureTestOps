import * as React from "react";

import type { RelationCardFocus } from "./relation-card-focus.js";

export type RelationsViewControlsApi = {
  focusedSuiteId: number | null;
  focusedCard: RelationCardFocus | null;
  mobileColumn: "test-cases" | "work-items";
  setFocusedSuiteId(next: number | null): void;
  toggleFocusedCard(next: RelationCardFocus): void;
  setMobileColumn(next: "test-cases" | "work-items"): void;
};

/** Owns transient view-only controls that deliberately do not enter lowdb. */
export function useRelationsViewControls(setId: string | null): RelationsViewControlsApi {
  const [focusedSuiteId, setFocusedSuiteId] = React.useState<number | null>(null);
  const [focusedCard, setFocusedCard] = React.useState<RelationCardFocus | null>(null);
  const [mobileColumn, setMobileColumn] = React.useState<"test-cases" | "work-items">("test-cases");

  const clearTransientState = React.useCallback(() => {
    setFocusedSuiteId(null);
    setFocusedCard(null);
  }, []);

  React.useEffect(() => {
    clearTransientState();
    setMobileColumn("test-cases");
  }, [setId, clearTransientState]);

  const updateFocusedSuite = React.useCallback((next: number | null) => {
    setFocusedSuiteId(next);
    if (next !== null) {
      setFocusedCard(null);
    }
  }, []);
  const toggleFocusedCard = React.useCallback((next: RelationCardFocus) => {
    setFocusedCard((current) => {
      if (current?.kind === next.kind && current.workItemId === next.workItemId) {
        return null;
      }
      return next;
    });
    setFocusedSuiteId(null);
  }, []);

  return {
    focusedSuiteId,
    focusedCard,
    mobileColumn,
    setFocusedSuiteId: updateFocusedSuite,
    toggleFocusedCard,
    setMobileColumn
  };
}
