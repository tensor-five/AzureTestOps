import type { MagicSortGeometry, MagicSortInput, MagicSortPlan } from "./magic-sort-model.js";
import { magicSortEdges, measureMagicSort, testCaseOccurrences, workItemSlots } from "./magic-sort-metrics.js";

export type MagicSortObservation = { input: MagicSortInput; geometry: MagicSortGeometry };

export function buildMagicSortDebugOutput(run: number, input: MagicSortInput, geometry: MagicSortGeometry, plan: MagicSortPlan, observed?: MagicSortObservation): string {
  const measuredInput = { ...input, ...geometry };
  const final = plan.steps.at(-1)!;
  const edges = magicSortEdges(final, measuredInput);
  const initialSlots = workItemSlots(input);
  const finalSlots = workItemSlots(final);
  const measured = Boolean(geometry.measuredTestCaseSlotCenters && geometry.measuredWorkItemSlotCenters);
  const centers = geometry.measuredWorkItemSlotCenters ?? [];
  const finalMetrics = measureMagicSort(final, measuredInput);
  const actualInput = observed ? { ...observed.input, ...observed.geometry } : undefined;
  const observedMeasured = Boolean(observed?.geometry.measuredTestCaseSlotCenters && observed.geometry.measuredWorkItemSlotCenters);
  const actualEdges = actualInput && observedMeasured ? magicSortEdges(actualInput, actualInput) : undefined;
  const key = (edge: { suiteId: number; testCaseId: number; workItemId: number }) => [edge.suiteId, edge.testCaseId, edge.workItemId].join(":");
  const actualByKey = new Map(actualEdges?.map(edge => [key(edge), edge]));
  const deviations = actualEdges ? edges.map(edge => {
    const actual = actualByKey.get(key(edge));
    return { suiteId: edge.suiteId, testCaseId: edge.testCaseId, workItemId: edge.workItemId, plannedLeft: edge.left, plannedRight: edge.right, actualLeft: actual?.left ?? null, actualRight: actual?.right ?? null, delta: actual ? Math.abs(actual.left - edge.left) + Math.abs(actual.right - edge.right) : null };
  }) : undefined;
  const report = {
    schema: "magic-sort-debug.v1",
    run,
    timestamp: new Date().toISOString(),
    visible: {
      testCaseIds: testCaseOccurrences(input, measuredInput).map(row => row.testCaseId),
      testCaseOccurrences: testCaseOccurrences(input, measuredInput),
      workItemIds: input.workItemIds
    },
    relations: edges.map(({ suiteId, testCaseId, workItemId }) => ({ suiteId, testCaseId, workItemId })),
    geometry: measured ? { state: "measured", testCaseCenters: geometry.measuredTestCaseSlotCenters, workItemSlotCenters: centers, workItemSlotHeight: centers.length > 1 ? (centers.at(-1)! - centers[0]!) / (centers.length - 1) : null }
      : { state: "fallback", reason: "DOM-Geometrie konnte nicht vollständig erfasst werden" },
    search: { slotRange: { from: 0, to: Math.max(centers.length - 1, ...Object.values(finalSlots)) }, stopReason: plan.stopReason ?? "unknown" },
    initial: { slots: initialSlots, metrics: measureMagicSort(input, measuredInput) },
    planned: { slots: finalSlots, edges, metrics: finalMetrics },
    observed: observed ? { state: observedMeasured ? "measured" : "unavailable", slots: actualInput ? workItemSlots(actualInput) : null, metrics: actualInput && observedMeasured ? measureMagicSort(actualInput, actualInput) : null, deviations } : { state: "pending" },
    relationDecisions: edges.map(edge => ({
      suiteId: edge.suiteId, testCaseId: edge.testCaseId, workItemId: edge.workItemId,
      initialSlot: initialSlots[edge.workItemId], finalSlot: finalSlots[edge.workItemId],
      decision: initialSlots[edge.workItemId] === finalSlots[edge.workItemId] ? "unchanged" : "accepted"
    })),
    summary: { crossings: finalMetrics.crossings, totalDistance: finalMetrics.length, unit: measured ? "px" : "slot", acceptedImprovements: Math.max(0, plan.steps.length - 1) }
  };
  return JSON.stringify(report, null, 2);
}
