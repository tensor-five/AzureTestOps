export type MagicSortSuite = { suiteId: number; testCaseIds: readonly number[] };
export type MagicSortWorkItem = { id: number; relatedTestCaseIds: readonly number[] };
export type MagicSortVisibleRow =
  | { kind: "suite-header"; suiteId: number }
  | { kind: "test-case"; suiteId: number; testCaseId: number };
export type MagicSortGeometry = {
  measuredTestCaseSlotCenters?: readonly number[];
  measuredWorkItemSlotCenters?: readonly number[];
};
export type MagicSortInput = MagicSortGeometry & {
  suites: readonly MagicSortSuite[];
  visibleRows?: readonly MagicSortVisibleRow[];
  workItemIds: readonly number[];
  workItems: readonly MagicSortWorkItem[];
  addSpacer?: boolean;
  workItemPositions?: Readonly<Record<number, number>>;
};
export type MagicSortLayout = {
  suites: readonly MagicSortSuite[];
  workItemIds: readonly number[];
  workItemPositions?: Readonly<Record<number, number>>;
};
export type MagicSortPlan = {
  steps: readonly MagicSortLayout[];
  stopReason?: "local-optimum" | "optimal-distance" | "iteration-budget";
};
