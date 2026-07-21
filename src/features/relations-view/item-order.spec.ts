import { describe, expect, it } from "vitest";

import {
  materializeItemOrder,
  moveItemInOrder,
  resolveAdjacentItemMove
} from "./item-order.js";

describe("item order", () => {
  it("materializes partial persisted orders with naturally ordered new ids", () => {
    expect(materializeItemOrder([8, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      8, 2, 1, 3, 4, 5, 6, 7, 9
    ]);
  });

  it("preserves stale ids while deduplicating and dropping invalid ids", () => {
    expect(materializeItemOrder([99, 2, 2, -1, Number.NaN], [1, 2, 3, 3])).toEqual([
      99, 2, 1, 3
    ]);
  });

  it("moves an item over a long distance exactly after its target", () => {
    expect(moveItemInOrder([], [1, 2, 3, 4, 5, 6, 7, 8], 2, 8, "after")).toEqual([
      1, 3, 4, 5, 6, 7, 8, 2
    ]);
  });

  it("moves an item from position 2 exactly before position 8", () => {
    expect(moveItemInOrder([], [1, 2, 3, 4, 5, 6, 7, 8], 2, 8, "before")).toEqual([
      1, 3, 4, 5, 6, 7, 2, 8
    ]);
  });

  it.each([
    ["before", [1, 8, 2, 3, 4, 5, 6, 7]],
    ["after", [1, 2, 8, 3, 4, 5, 6, 7]]
  ] as const)(
    "moves an item backwards from position 8 to position 2 exactly %s its target",
    (edge, expected) => {
      expect(moveItemInOrder([], [1, 2, 3, 4, 5, 6, 7, 8], 8, 2, edge)).toEqual(expected);
    }
  );

  it("moves an item exactly before its target in a partial order", () => {
    expect(moveItemInOrder([4, 2], [1, 2, 3, 4], 1, 4, "before")).toEqual([
      1, 4, 2, 3
    ]);
  });

  it("returns the materialized order for invalid move combinations", () => {
    expect(moveItemInOrder([3], [1, 2, 3], 2, 2, "before")).toEqual([3, 1, 2]);
    expect(moveItemInOrder([3], [1, 2, 3], 20, 2, "after")).toEqual([3, 1, 2]);
  });

  it("resolves keyboard moves relative to visible neighbours", () => {
    expect(resolveAdjacentItemMove([2, 8], 8, "up")).toEqual({
      targetId: 2,
      edge: "before"
    });
    expect(resolveAdjacentItemMove([2, 8], 2, "down")).toEqual({
      targetId: 8,
      edge: "after"
    });
    expect(resolveAdjacentItemMove([2, 8], 2, "up")).toBeNull();
    expect(resolveAdjacentItemMove([2, 8], 8, "down")).toBeNull();
  });
});
