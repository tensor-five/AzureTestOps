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
      : findTestCaseOccurrence(container, row.suiteId, row.testCaseId)
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
    return {};
  }

  const centers = workItemSlotCenters as number[];
  const firstSlot = container.querySelector<HTMLElement>(".relations-view-work-item-list > li");
  const list = firstSlot?.parentElement;
  const gap = list ? Number.parseFloat(list.ownerDocument.defaultView?.getComputedStyle(list).rowGap ?? "0") || 0 : 0;
  const pitch = centers.length > 1
    ? (centers.at(-1)! - centers[0]!) / (centers.length - 1)
    : (firstSlot?.getBoundingClientRect().height ?? 0) + gap;
  if (centers.length > 0 && pitch <= 0) return {};
  const neededForRange = centers.length === 0 || testCaseSlotCenters.length === 0 ? 0
    : Math.max(1, Math.ceil((Math.max(...testCaseSlotCenters as number[]) - centers[0]!) / pitch) + 1);
  extendWorkItemSlotCenters(centers, Math.max(input.workItemIds.length, input.visibleRows.length, neededForRange, centers.length === 1 ? 2 : 0), pitch);

  return {
    measuredTestCaseSlotCenters: testCaseSlotCenters as number[],
    measuredWorkItemSlotCenters: workItemSlotCenters as number[]
  };
}

function findTestCaseOccurrence(container: HTMLElement, suiteId: number, testCaseId: number): HTMLElement | null {
  const selector = `[data-test-case-id="${testCaseId}"]`;
  const scoped = container.querySelector<HTMLElement>(`[data-suite-cards][data-suite-id="${suiteId}"] ${selector}`);
  if (scoped) return scoped;
  const candidates = container.querySelectorAll<HTMLElement>(selector);
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Candidate Spacer slots may not exist in the DOM yet. Extend the real slot
 * grid with its measured pitch so Magic Sort never compares pixel centres with
 * raw list indices after the Bug-stack gap changes.
 */
function extendWorkItemSlotCenters(centers: number[], requiredLength: number, pitch: number): void {
  if (centers.length === 0) return;
  while (centers.length < requiredLength) {
    centers.push(centers.at(-1)! + pitch);
  }
}
