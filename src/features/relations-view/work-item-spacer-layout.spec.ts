import { describe, expect, it } from "vitest";
import { completeWorkItemSpacerLayout, projectVisibleSpacerLayout, replaceVisibleSpacerPositions } from "./work-item-spacer-layout.js";

describe("Filtered spacer projection", () => {
  it("round-trips every visible subset without losing or duplicating hidden IDs", () => {
    const original = [101, null, 102, null, 103, 104];
    for (let mask = 1; mask < 16; mask += 1) {
      const visible = [101, 102, 103, 104].filter((_, i) => mask & (1 << i));
      const positions = Object.fromEntries(visible.map((id, i) => [id, i * 2 + 1]));
      const result = replaceVisibleSpacerPositions(original, visible, positions);
      const projected = projectVisibleSpacerLayout(result, new Set(visible));
      expect(Object.fromEntries(projected.flatMap((row, slot) => row.workItemId === null ? [] : [[row.workItemId, slot]]))).toEqual(positions);
      expect(result.filter(id => id !== null).sort()).toEqual([101, 102, 103, 104]);
      expect(result.filter(id => id !== null && !visible.includes(id))).toEqual(original.filter(id => id !== null && !visible.includes(id)));
    }
  });
  it("completes a partial layout without moving manual spacer tokens", () => {
    expect(completeWorkItemSpacerLayout([null, 101, null], [101, 102, 102])).toEqual([null, 101, null, 102]);
  });
});
