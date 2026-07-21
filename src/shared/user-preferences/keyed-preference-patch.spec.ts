import { describe, expect, it } from "vitest";

import { sanitizeKeyedPreferencePatch } from "./keyed-preference-patch.js";

describe("sanitizeKeyedPreferencePatch", () => {
  it("retains sanitized values and explicit empty-object tombstones", () => {
    const result = sanitizeKeyedPreferencePatch(
      {
        setLayouts: {
          " valid ": { workItemOrder: [1, 2] },
          deleted: {}
        }
      },
      "setLayouts",
      { valid: { workItemOrder: [1, 2] } }
    );

    expect(result.values).toEqual({
      valid: { workItemOrder: [1, 2] },
      deleted: {}
    });
    expect([...result.touchedIds ?? []]).toEqual(["valid", "deleted"]);
  });

  it("ignores invalid and unknown non-empty entries instead of deleting them", () => {
    const result = sanitizeKeyedPreferencePatch(
      {
        setFilters: {
          invalidPrimitive: "future-format",
          invalidKnownShape: { testCases: { titleQuery: 42 } },
          newerVersion: { version: 2, data: { mode: "future" } }
        }
      },
      "setFilters",
      undefined
    );

    expect(result.values).toBeUndefined();
    expect([...result.touchedIds ?? []]).toEqual([]);
  });

  it("distinguishes an absent keyed field from an explicitly empty map", () => {
    expect(
      sanitizeKeyedPreferencePatch({}, "setLayouts", undefined).touchedIds
    ).toBeNull();
    expect(
      sanitizeKeyedPreferencePatch({ setLayouts: {} }, "setLayouts", undefined).touchedIds
    ).toEqual(new Set());
  });
});
