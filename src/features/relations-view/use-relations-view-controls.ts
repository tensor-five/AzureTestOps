import * as React from "react";

export type RelationsViewControlsApi = {
  focusedSuiteId: number | null;
  mobileColumn: "test-cases" | "work-items";
  setFocusedSuiteId(next: number | null): void;
  setMobileColumn(next: "test-cases" | "work-items"): void;
};

/** Owns transient view-only controls that deliberately do not enter lowdb. */
export function useRelationsViewControls(setId: string | null): RelationsViewControlsApi {
  const [focusedSuiteId, setFocusedSuiteId] = React.useState<number | null>(null);
  const [mobileColumn, setMobileColumn] = React.useState<"test-cases" | "work-items">("test-cases");

  const clearTransientState = React.useCallback(() => {
    setFocusedSuiteId(null);
  }, []);

  React.useEffect(() => {
    clearTransientState();
    setMobileColumn("test-cases");
  }, [setId, clearTransientState]);

  return {
    focusedSuiteId,
    mobileColumn,
    setFocusedSuiteId,
    setMobileColumn
  };
}
