import { describe, expect, it } from "vitest";

import { mapConcurrent } from "./concurrency.js";

describe("mapConcurrent", () => {
  it("preserves input order in the output", async () => {
    const result = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("respects the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await mapConcurrent([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns an empty array for an empty input", async () => {
    expect(await mapConcurrent([], 4, async () => 1)).toEqual([]);
  });
});
