import type { MagicSortInput, MagicSortVisibleRow } from "./magic-sort-layout.js";

export type MagicSortGeometryInput = {
  container: HTMLElement | null;
  visibleRows: readonly MagicSortVisibleRow[];
  workItemIds: readonly number[];
};

/**
 * Captures the same card-centre coordinates that the relation-line layer
 * renders. The snapshot is intentionally taken only when Magic Sort starts.
 */
export function captureMagicSortGeometry(
  input: MagicSortGeometryInput
): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters"> {
  const { container } = input;
  if (!container) {
    return {};
  }

  const containerTop = container.getBoundingClientRect().top;
  const centre = (element: HTMLElement | null): number | undefined => {
    if (!element) {
      return undefined;
    }
    const rect = element.getBoundingClientRect();
    return rect.height > 0 ? rect.top - containerTop + rect.height / 2 : undefined;
  };
  const testCaseSlotCenters = input.visibleRows.map((row) => centre(
    row.kind === "suite-header"
      ? (container.querySelector<HTMLElement>(`[data-suite-id="${row.suiteId}"]`)
        ?.closest<HTMLElement>(".relations-view-suite-header") ?? null)
      : container.querySelector<HTMLElement>(`[data-test-case-id="${row.testCaseId}"]`)
  ));
  const workItemSlotCenters = Array.from(
    container.querySelectorAll<HTMLElement>(".relations-view-work-item-list > li")
  ).map((slot) => centre(slot));

  if (
    testCaseSlotCenters.some((value) => value === undefined)
    || workItemSlotCenters.some((value) => value === undefined)
    || workItemSlotCenters.length < input.workItemIds.length
  ) {
    return {};
  }

  return {
    measuredTestCaseSlotCenters: testCaseSlotCenters as number[],
    measuredWorkItemSlotCenters: workItemSlotCenters as number[]
  };
}
