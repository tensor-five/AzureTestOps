import type { MagicSortInput, MagicSortLayout } from "./magic-sort-model.js";

export type MagicSortEdge = { suiteId: number; testCaseId: number; workItemId: number; left: number; right: number };
export type MagicSortMetrics = { crossings: number; length: number; spacers: number };

/** A position belongs to a suite occurrence, never just to an ADO work item. */
export function testCaseOccurrences(layout: MagicSortLayout, input: MagicSortInput) {
  const rows = input.visibleRows ?? layout.suites.flatMap(suite => suite.testCaseIds.map(testCaseId => ({ kind: "test-case" as const, suiteId: suite.suiteId, testCaseId })));
  const queues = new Map(layout.suites.map(suite => [suite.suiteId, [...suite.testCaseIds]]));
  return rows.flatMap((row, slot) => {
    if (row.kind !== "test-case") return [];
    const testCaseId = queues.get(row.suiteId)?.shift();
    return testCaseId === undefined ? [] : [{ suiteId: row.suiteId, testCaseId, slot, y: input.measuredTestCaseSlotCenters?.[slot] ?? slot }];
  });
}

export function workItemSlots(layout: MagicSortLayout): Record<number, number> {
  return Object.fromEntries(layout.workItemIds.map((id, index) => [id, layout.workItemPositions?.[id] ?? index]));
}

export function workItemSlotCenter(input: MagicSortInput, slot: number): number {
  const centers = input.measuredWorkItemSlotCenters;
  if (!centers?.length) return slot;
  if (centers[slot] !== undefined) return centers[slot]!;
  // Geometry capture supplies a positive pitch, including a single visible Bug.
  const pitch = centers.length > 1 ? (centers.at(-1)! - centers[0]!) / (centers.length - 1) : 0;
  return centers.at(-1)! + (slot - centers.length + 1) * pitch;
}

export function magicSortEdges(layout: MagicSortLayout, input: MagicSortInput): MagicSortEdge[] {
  const occurrences = testCaseOccurrences(layout, input);
  const items = new Map(input.workItems.map(item => [item.id, new Set(item.relatedTestCaseIds)]));
  const slots = workItemSlots(layout);
  return layout.workItemIds.flatMap(workItemId => occurrences
    .filter(row => items.get(workItemId)?.has(row.testCaseId))
    .map(row => ({ suiteId: row.suiteId, testCaseId: row.testCaseId, workItemId, left: row.y, right: workItemSlotCenter(input, slots[workItemId]!) })));
}

export function measureMagicSort(layout: MagicSortLayout, input: MagicSortInput): MagicSortMetrics {
  const edges = magicSortEdges(layout, input);
  let crossings = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      if ((edges[i]!.left - edges[j]!.left) * (edges[i]!.right - edges[j]!.right) < 0) crossings += 1;
    }
  }
  const slots = Object.values(workItemSlots(layout));
  return { crossings, length: edges.reduce((sum, edge) => sum + Math.abs(edge.left - edge.right), 0), spacers: Math.max(0, Math.max(-1, ...slots) + 1 - slots.length) };
}
