import { describe, expect, it } from "vitest";

import { sanitizeUserPreferences, sanitizeSetPreference } from "./user-preferences.schema.js";

describe("sanitizeUserPreferences", () => {
  it("returns an empty object for non-records", () => {
    expect(sanitizeUserPreferences(null)).toEqual({});
    expect(sanitizeUserPreferences(undefined)).toEqual({});
    expect(sanitizeUserPreferences("string")).toEqual({});
    expect(sanitizeUserPreferences([1, 2])).toEqual({});
  });

  it("only keeps known theme modes", () => {
    expect(sanitizeUserPreferences({ themeMode: "dark" }).themeMode).toBe("dark");
    expect(sanitizeUserPreferences({ themeMode: "light" }).themeMode).toBe("light");
    expect(sanitizeUserPreferences({ themeMode: "system" }).themeMode).toBe("system");
    expect(sanitizeUserPreferences({ themeMode: "rainbow" }).themeMode).toBeUndefined();
  });

  it("dedupes Sets by id and drops invalid entries", () => {
    const input = {
      sets: [
        { id: "a", name: "Alpha", planId: "1", suiteId: "10", queryId: "q-1" },
        { id: "a", name: "Duplicate", planId: "1", suiteId: "10", queryId: "q-1" },
        { id: "b", name: "Beta", planId: "2", suiteId: "20", queryId: "q-2" },
        { name: "missing-id", planId: "3", suiteId: "30", queryId: "q-3" }
      ]
    };

    const sanitized = sanitizeUserPreferences(input);
    expect(sanitized.sets).toHaveLength(2);
    expect(sanitized.sets?.map((set) => set.id)).toEqual(["a", "b"]);
    expect(sanitized.sets?.[0]?.name).toBe("Alpha");
  });

  it("trims activeSetId and discards blanks", () => {
    expect(sanitizeUserPreferences({ activeSetId: "  s1  " }).activeSetId).toBe("s1");
    expect(sanitizeUserPreferences({ activeSetId: "" }).activeSetId).toBeUndefined();
  });

  it("filters setLayouts by valid set id and finite x/y", () => {
    const input = {
      setLayouts: {
        "  ": { positions: { "1": { x: 0, y: 0 } } },
        s1: {
          positions: {
            "1": { x: 10, y: 20 },
            "2": { x: NaN, y: 5 },
            "  ": { x: 1, y: 1 }
          },
          collapsedSuites: ["sa", "sa", "  "]
        },
        s2: {}
      }
    };

    const sanitized = sanitizeUserPreferences(input);
    expect(sanitized.setLayouts).toEqual({
      s1: {
        positions: { "1": { x: 10, y: 20 } },
        collapsedSuites: ["sa"]
      }
    });
  });

  it("passes opaque records through setFilters", () => {
    const input = {
      setFilters: {
        s1: { lastOutcome: ["Failed"], titleQuery: "auth" },
        "": { lastOutcome: ["NotRun"] }
      }
    };
    expect(sanitizeUserPreferences(input).setFilters).toEqual({
      s1: { lastOutcome: ["Failed"], titleQuery: "auth" }
    });
  });
});

describe("sanitizeSetPreference", () => {
  it("requires id, planId, suiteId and queryId", () => {
    expect(
      sanitizeSetPreference({ id: "a", planId: "1", suiteId: "10", queryId: "q-1" })
    ).toMatchObject({ id: "a", name: "a", planId: "1", suiteId: "10", queryId: "q-1" });

    expect(sanitizeSetPreference({ id: "a", planId: "1", suiteId: "10" })).toBeNull();
    expect(sanitizeSetPreference({})).toBeNull();
    expect(sanitizeSetPreference(null)).toBeNull();
  });

  it("preserves optional names and org/project", () => {
    const set = sanitizeSetPreference({
      id: "a",
      name: "Alpha",
      planId: "1",
      planName: "Plan One",
      suiteId: "10",
      suiteName: "Root",
      queryId: "q-1",
      queryName: "Bugs",
      organization: "contoso",
      project: "delivery"
    });

    expect(set).toEqual({
      id: "a",
      name: "Alpha",
      planId: "1",
      planName: "Plan One",
      suiteId: "10",
      suiteName: "Root",
      queryId: "q-1",
      queryName: "Bugs",
      organization: "contoso",
      project: "delivery"
    });
  });
});
