import type { MagicSortInput, MagicSortLayout } from "./magic-sort-model.js";
import { magicSortEdges, workItemSlotCenter, workItemSlots } from "./magic-sort-metrics.js";

/** Exact minimum-distance slot assignment for the given connected Bug order.
 * Prefix minima make the recurrence O(Bugs × slots), without enumerating gaps.
 * Unlinked Bugs fill remaining positions in their existing relative order.
 */
export function optimizeSpacerPositions(layout: MagicSortLayout, input: MagicSortInput): MagicSortLayout {
  const targets = new Map<number, number[]>();
  magicSortEdges(layout, input).forEach(edge => targets.set(edge.workItemId, [...(targets.get(edge.workItemId) ?? []), edge.left]));
  const linked = layout.workItemIds.filter(id => targets.has(id));
  const unlinked = layout.workItemIds.filter(id => !targets.has(id));
  const count = Math.max(layout.workItemIds.length, input.visibleRows?.length ?? input.suites.reduce((n, suite) => n + suite.testCaseIds.length, 0), input.measuredWorkItemSlotCenters?.length ?? 0) + Math.max(0, linked.length - 1);
  const baseline = workItemSlots(input);
  let distances = new Float64Array(count).fill(Infinity);
  let movement = new Float64Array(count).fill(Infinity);
  const parents: Int32Array[] = [];
  linked.forEach((id, row) => {
    const nextDistances = new Float64Array(count).fill(Infinity);
    const nextMovement = new Float64Array(count).fill(Infinity);
    const previousSlot = new Int32Array(count).fill(-1);
    let best = -1;
    for (let slot = 0; slot < count; slot += 1) {
      const prior = slot - 1;
      if (prior >= 0 && (best < 0 || distances[prior]! < distances[best]! || (distances[prior] === distances[best] && movement[prior]! < movement[best]!))) best = prior;
      if (row > 0 && (best < 0 || !Number.isFinite(distances[best]!))) continue;
      const cost = targets.get(id)!.reduce((sum, y) => sum + Math.abs(y - workItemSlotCenter(input, slot)), 0);
      nextDistances[slot] = cost + (row === 0 ? 0 : distances[best!]!);
      nextMovement[slot] = Math.abs(slot - baseline[id]!) + (row === 0 ? 0 : movement[best!]!);
      previousSlot[slot] = row === 0 ? -1 : best;
    }
    distances = nextDistances; movement = nextMovement; parents.push(previousSlot);
  });
  const positions: Record<number, number> = {};
  if (linked.length > 0) {
    let best = linked.length - 1;
    for (let slot = linked.length; slot < count; slot += 1) {
      // Fewer total slots win before movement when distance is identical.
      if (distances[slot]! < distances[best]!) best = slot;
    }
    for (let row = linked.length - 1; row >= 0; row -= 1) {
      positions[linked[row]!] = best;
      best = parents[row]![best]!;
    }
  }
  const occupied = new Set(Object.values(positions));
  let slot = 0;
  unlinked.forEach(id => { while (occupied.has(slot)) slot += 1; positions[id] = slot++; });
  return { suites: layout.suites, workItemIds: [...layout.workItemIds].sort((a, b) => positions[a]! - positions[b]!), workItemPositions: positions };
}
