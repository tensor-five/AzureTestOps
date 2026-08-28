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
    logMagicSortGeometry({ reason: "missing-container" });
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

  const missingTestCaseCenters = testCaseSlotCenters
    .map((center, index) => center === undefined ? input.visibleRows[index] : undefined)
    .filter((row) => row !== undefined);
  const missingWorkItemSlotIndexes = workItemSlotCenters
    .flatMap((center, index) => center === undefined ? [index] : []);
  const tooFewWorkItemSlots = workItemSlotCenters.length < input.workItemIds.length;

  if (
    missingTestCaseCenters.length > 0
    || missingWorkItemSlotIndexes.length > 0
    || tooFewWorkItemSlots
  ) {
    logMagicSortGeometry({
      reason: "incomplete-dom-geometry",
      visibleRows: input.visibleRows,
      workItemIds: input.workItemIds,
      testCaseSlotCenters,
      workItemSlotCenters,
      missingTestCaseCenters,
      missingWorkItemSlotIndexes,
      tooFewWorkItemSlots
    });
    return {};
  }

  const centers = workItemSlotCenters as number[];
  extendWorkItemSlotCenters(centers, Math.max(input.visibleRows.length, slotsNeededForTestCaseRange(centers, testCaseSlotCenters as number[])));

  logMagicSortGeometry({ reason: "captured", testCaseSlotCenters: testCaseSlotCenters as number[], workItemSlotCenters: centers });

  return {
    measuredTestCaseSlotCenters: testCaseSlotCenters as number[],
    measuredWorkItemSlotCenters: workItemSlotCenters as number[]
  };
}

function slotsNeededForTestCaseRange(workItemCenters: readonly number[], testCaseCenters: readonly number[]): number {
  if (workItemCenters.length < 2 || testCaseCenters.length === 0) return workItemCenters.length;
  const pitch = (workItemCenters.at(-1)! - workItemCenters[0]!) / (workItemCenters.length - 1);
  if (pitch <= 0) return workItemCenters.length;
  return Math.max(1, Math.ceil((Math.max(...testCaseCenters) - workItemCenters[0]!) / pitch) + 1);
}

function logMagicSortGeometry(values: Record<string, unknown>): void {
  if (!globalThis.location?.search.includes("magicSortDebug=1")) return;
  console.debug("[Magic Sort geometry]", values);
}

/**
 * Candidate Spacer slots may not exist in the DOM yet. Extend the real slot
 * grid with its measured pitch so Magic Sort never compares pixel centres with
 * raw list indices after the Bug-stack gap changes.
 */
function extendWorkItemSlotCenters(centers: number[], requiredLength: number): void {
  if (centers.length === 0) return;
  const pitch = centers.length > 1
    ? (centers.at(-1)! - centers[0]!) / (centers.length - 1)
    : 0;
  while (centers.length < requiredLength) {
    centers.push(centers.at(-1)! + pitch);
  }
}
