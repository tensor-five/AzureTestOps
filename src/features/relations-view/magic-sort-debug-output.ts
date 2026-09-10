import type { MagicSortInput, MagicSortLayout, MagicSortPlan } from "./magic-sort-layout.js";

export function buildMagicSortDebugOutput(run: number, input: MagicSortInput, geometry: Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">, plan: MagicSortPlan): string {
  const testCaseIds = (input.visibleRows ?? []).flatMap((row) => row.kind === "test-case" ? [row.testCaseId] : []);
  const workItemIds = [...input.workItemIds];
  const relations = input.workItems.filter((item) => workItemIds.includes(item.id)).flatMap((item) => item.relatedTestCaseIds
    .filter((testCaseId) => testCaseIds.includes(testCaseId))
    .map((testCaseId) => ({ testCaseId, workItemId: item.id }))
  );
  const measured = Boolean(geometry.measuredTestCaseSlotCenters && geometry.measuredWorkItemSlotCenters);
  const centers = geometry.measuredWorkItemSlotCenters ?? [];
  const slotHeight = centers.length > 1 ? (centers.at(-1)! - centers[0]!) / (centers.length - 1) : 0;
  const final = plan.steps.at(-1)!;
  const initialSlots = slotsFor(plan.steps[0]!);
  const finalSlots = slotsFor(final);
  const maxSlot = Math.max(centers.length - 1, (input.visibleRows?.length ?? 0) - 1, ...Object.values(finalSlots), workItemIds.length - 1);
  const edges = relations.map((relation) => ({
    ...relation,
    left: testCasePosition(final, input, relation.testCaseId),
    right: finalSlots[relation.workItemId] ?? 0
  }));
  const report = {
    schema: "magic-sort-debug.v1",
    run,
    timestamp: new Date().toISOString(),
    visible: { testCaseIds, workItemIds },
    relations: relations.sort((a, b) => a.testCaseId - b.testCaseId || a.workItemId - b.workItemId),
    geometry: measured ? {
      state: "measured", testCaseCenters: geometry.measuredTestCaseSlotCenters,
      workItemSlotCenters: centers, workItemSlotHeight: slotHeight
    } : { state: "fallback", reason: "DOM-Geometrie konnte nicht vollständig erfasst werden" },
    search: { slotRange: { from: 0, to: maxSlot } },
    relationDecisions: relations.map((relation) => ({
      ...relation,
      initialSlot: initialSlots[relation.workItemId] ?? 0,
      finalSlot: finalSlots[relation.workItemId] ?? 0,
      decision: (initialSlots[relation.workItemId] ?? 0) === (finalSlots[relation.workItemId] ?? 0) ? "unchanged" : "accepted"
    })),
    summary: {
      crossings: crossings(edges), totalDistance: edges.reduce((sum, edge) => sum + Math.abs(edge.left - edge.right), 0),
      acceptedImprovements: Math.max(0, plan.steps.length - 1)
    }
  };
  return JSON.stringify(report, null, 2);
}

function slotsFor(layout: MagicSortLayout): Record<number, number> {
  return layout.workItemPositions ? { ...layout.workItemPositions } : Object.fromEntries(layout.workItemIds.map((id, index) => [id, index]));
}
function testCasePosition(layout: MagicSortLayout, input: MagicSortInput, id: number): number {
  const order = layout.suites.flatMap((suite) => suite.testCaseIds);
  const visibleIndex = (input.visibleRows ?? []).findIndex((row) => row.kind === "test-case" && row.testCaseId === id);
  return visibleIndex >= 0 ? visibleIndex : order.indexOf(id);
}
function crossings(edges: readonly { left: number; right: number }[]): number {
  return edges.reduce((sum, edge, index) => sum + edges.slice(index + 1).filter((other) => (edge.left - other.left) * (edge.right - other.right) < 0).length, 0);
}
