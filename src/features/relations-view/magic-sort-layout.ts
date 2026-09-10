import type { MagicSortInput, MagicSortLayout, MagicSortPlan } from "./magic-sort-model.js";
import { magicSortEdges, measureMagicSort, testCaseOccurrences, workItemSlots, type MagicSortMetrics } from "./magic-sort-metrics.js";
import { optimizeSpacerPositions } from "./magic-sort-spacer-optimizer.js";

export type { MagicSortInput, MagicSortLayout, MagicSortPlan, MagicSortSuite, MagicSortVisibleRow, MagicSortWorkItem } from "./magic-sort-model.js";

/** Pure optimizer. Every published step is Pareto-safe against the actual input. */
export function planMagicSort(input: MagicSortInput): MagicSortPlan {
  let current = initialLayout(input);
  const steps: MagicSortLayout[] = [current];
  const originalSlots = workItemSlots(input);
  const originalTestCaseSlots = new Map(testCaseOccurrences(input, input).map(row => [`${row.suiteId}:${row.testCaseId}`, row.slot]));
  const displacement = (layout: MagicSortLayout) => Object.entries(workItemSlots(layout)).reduce((sum, [id, slot]) => sum + Math.abs(slot - originalSlots[Number(id)]!), 0)
    + testCaseOccurrences(layout, input).reduce((sum, row) => sum + Math.abs(row.slot - (originalTestCaseSlots.get(`${row.suiteId}:${row.testCaseId}`) ?? row.slot)), 0);
  const budget = Math.max(48, input.workItemIds.length + input.suites.reduce((n, suite) => n + suite.testCaseIds.length, 0));
  for (let iteration = 0; iteration < budget; iteration += 1) {
    const before = measureMagicSort(current, input);
    let best = current;
    let bestMetrics = before;
    const consider = (candidate: MagicSortLayout) => {
      const metrics = measureMagicSort(candidate, input);
      if (metrics.crossings > before.crossings || metrics.length > before.length + 1e-7) return;
      const comparison = compareMetrics(metrics, bestMetrics);
      if (comparison < 0 || (comparison === 0 && displacement(candidate) < displacement(best))) {
        best = candidate;
        bestMetrics = metrics;
      }
    };
    if (input.addSpacer) {
      consider(optimizeSpacerPositions(current, input));
      consider({ ...current, workItemPositions: Object.fromEntries(current.workItemIds.map((id, i) => [id, i])) });
      if (bestMetrics.length > 1e-7 || bestMetrics.crossings > 0) {
        const targets = new Map<number, number[]>();
        magicSortEdges(current, input).forEach(edge => targets.set(edge.workItemId, [...(targets.get(edge.workItemId) ?? []), edge.left]));
        const median = (id: number) => {
          const ys = targets.get(id)?.slice().sort((a, b) => a - b);
          return ys?.[Math.floor(ys.length / 2)] ?? Infinity;
        };
        consider(optimizeSpacerPositions({ ...current, workItemIds: [...current.workItemIds].sort((a, b) => median(a) - median(b)) }, input));
      }
    }
    if (bestMetrics.length > 1e-7 || bestMetrics.crossings > 0) {
      for (let index = 0; index < current.workItemIds.length - 1; index += 1) {
        const candidate = { ...current, workItemIds: swapAt(current.workItemIds, index) };
        consider(input.addSpacer ? optimizeSpacerPositions(candidate, input) : candidate);
      }
      current.suites.forEach((suite, suiteIndex) => {
        for (let index = 0; index < suite.testCaseIds.length - 1; index += 1) {
          const candidate = { ...current, suites: current.suites.map((s, i) => i === suiteIndex ? { ...s, testCaseIds: swapAt(s.testCaseIds, index) } : s) };
          consider(input.addSpacer ? optimizeSpacerPositions(candidate, input) : candidate);
        }
      });
    }
    if (best === current) return { steps, stopReason: before.length < 1e-7 && before.crossings === 0 ? "optimal-distance" : "local-optimum" };
    current = best;
    steps.push(current);
  }
  return { steps, stopReason: "iteration-budget" };
}

function initialLayout(input: MagicSortInput): MagicSortLayout {
  const suites = input.suites.map(suite => ({ ...suite, testCaseIds: [...suite.testCaseIds] }));
  if (!input.addSpacer) return { suites, workItemIds: [...input.workItemIds] };
  const occupied = new Set<number>();
  const positions: Record<number, number> = {};
  input.workItemIds.forEach((id, index) => {
    const stored = input.workItemPositions?.[id];
    let slot = typeof stored === "number" && Number.isInteger(stored) && stored >= 0 ? stored : index;
    while (occupied.has(slot)) slot += 1;
    positions[id] = slot; occupied.add(slot);
  });
  const layout = { suites, workItemIds: [...input.workItemIds].sort((a, b) => positions[a]! - positions[b]!), workItemPositions: positions };
  // Only unlinked cards are compacted here: their movement cannot alter an edge.
  const linked = new Set(magicSortEdges(layout, input).map(edge => edge.workItemId));
  const linkedSlots = new Set(input.workItemIds.filter(id => linked.has(id)).map(id => positions[id]!));
  let slot = 0;
  layout.workItemIds.filter(id => !linked.has(id)).forEach(id => { while (linkedSlots.has(slot)) slot += 1; positions[id] = slot++; });
  layout.workItemIds.sort((a, b) => positions[a]! - positions[b]!);
  return layout;
}

function compareMetrics(a: MagicSortMetrics, b: MagicSortMetrics): number {
  return a.crossings - b.crossings || (Math.abs(a.length - b.length) > 1e-7 ? a.length - b.length : 0) || a.spacers - b.spacers;
}

function swapAt(ids: readonly number[], index: number): number[] {
  const next = [...ids];
  [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
  return next;
}
