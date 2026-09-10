import { describe, expect, it } from "vitest";
import { optimizeSpacerPositions } from "./magic-sort-spacer-optimizer.js";
import { magicSortEdges, measureMagicSort } from "./magic-sort-metrics.js";
import type { MagicSortInput } from "./magic-sort-model.js";

describe("Joint spacer optimization", () => {
  it("matches an independently enumerated optimum for every small two-Bug target combination", () => {
    for (let left = 0; left < 6; left += 1) for (let right = 0; right < 6; right += 1) {
      const input: MagicSortInput = { suites: [{ suiteId: 1, testCaseIds: [101, 102] }], workItemIds: [201, 202], workItems: [{ id: 201, relatedTestCaseIds: [101] }, { id: 202, relatedTestCaseIds: [102] }], addSpacer: true, measuredTestCaseSlotCenters: [left * 10, right * 10], measuredWorkItemSlotCenters: [0, 10, 20, 30, 40, 50] };
      let optimum = Infinity;
      for (let a = 0; a < 6; a += 1) for (let b = a + 1; b < 6; b += 1) optimum = Math.min(optimum, Math.abs(a * 10 - left * 10) + Math.abs(b * 10 - right * 10));
      const result = optimizeSpacerPositions(input, input);
      const slots = result.workItemPositions!;
      expect(Math.abs(slots[201]! * 10 - left * 10) + Math.abs(slots[202]! * 10 - right * 10)).toBe(optimum);
      expect(slots[201]).toBeLessThan(slots[202]!);
      expect(optimizeSpacerPositions(input, input)).toEqual(result);
    }
  });

  it("counts every visible suite occurrence and ignores relations without visible endpoints", () => {
    const input: MagicSortInput = { suites: [{ suiteId: 1, testCaseIds: [101] }, { suiteId: 2, testCaseIds: [101] }], workItemIds: [201], workItems: [{ id: 201, relatedTestCaseIds: [101, 999] }], measuredTestCaseSlotCenters: [100, 300], measuredWorkItemSlotCenters: [100, 200, 300] };
    expect(magicSortEdges(input, input)).toHaveLength(2);
    expect(measureMagicSort(input, input)).toMatchObject({ crossings: 0, length: 200 });
  });

  it("places a shared-target group on both sides of the last Test Case", () => {
    const input: MagicSortInput = { suites: [{ suiteId: 1, testCaseIds: [101] }], workItemIds: [201, 202, 203, 204, 205], workItems: [201, 202, 203, 204, 205].map(id => ({ id, relatedTestCaseIds: [101] })), measuredTestCaseSlotCenters: [90], measuredWorkItemSlotCenters: Array.from({ length: 10 }, (_, i) => i * 10), addSpacer: true };
    expect(measureMagicSort(optimizeSpacerPositions(input, input), input).length).toBe(60);
  });
});
