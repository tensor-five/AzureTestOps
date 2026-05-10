import { describe, expect, it } from "vitest";

import {
  sanitizeSetFilterPreference,
  sanitizeSetPreference,
  sanitizeUserPreferences
} from "./user-preferences.schema.js";

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
        { id: "a", name: "Alpha", planId: "1", rootSuiteId: "10", queryId: "q-1" },
        { id: "a", name: "Duplicate", planId: "1", rootSuiteId: "10", queryId: "q-1" },
        { id: "b", name: "Beta", planId: "2", rootSuiteId: "20", queryId: "q-2" },
        { name: "missing-id", planId: "3", rootSuiteId: "30", queryId: "q-3" }
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

  it("normalizes the saved ADO context", () => {
    expect(
      sanitizeUserPreferences({
        adoContext: { organization: "  contoso  ", project: " delivery " }
      }).adoContext
    ).toEqual({ organization: "contoso", project: "delivery" });

    expect(
      sanitizeUserPreferences({
        adoContext: { organization: "contoso", project: "  " }
      }).adoContext
    ).toBeUndefined();
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

  it("preserves and dedupes positive-integer workItemOrder entries per set", () => {
    const input = {
      setLayouts: {
        s1: {
          workItemOrder: [501, 503, 501, 502, "504", -1, 0, 502.5, NaN]
        }
      }
    };

    const sanitized = sanitizeUserPreferences(input);
    expect(sanitized.setLayouts).toEqual({
      s1: { workItemOrder: [501, 503, 502] }
    });
  });

  it("preserves testCaseOrder per suite, dedupes ids, and drops empty suites/blank keys", () => {
    const input = {
      setLayouts: {
        s1: {
          testCaseOrder: {
            "3": [201, 202, 201, "203", -5, 0],
            "4": [301],
            "  ": [999],
            "5": ["all-junk", -1]
          }
        }
      }
    };

    const sanitized = sanitizeUserPreferences(input);
    expect(sanitized.setLayouts).toEqual({
      s1: {
        testCaseOrder: {
          "3": [201, 202],
          "4": [301]
        }
      }
    });
  });

  it("normalizes typed setFilters and drops empty / unkeyed entries", () => {
    const input = {
      setFilters: {
        s1: {
          testCases: {
            titleQuery: "  auth  ",
            lastOutcomes: ["Failed", "Failed", " ", "NotRun"],
            states: ["Active"],
            workItemTypes: []
          },
          workItems: { tags: ["regression", "regression", "release-blocker"] }
        },
        s2: { unrelated: 1 },
        "": { testCases: { titleQuery: "ignored" } }
      }
    };

    expect(sanitizeUserPreferences(input).setFilters).toEqual({
      s1: {
        testCases: {
          titleQuery: "auth",
          lastOutcomes: ["Failed", "NotRun"],
          states: ["Active"]
        },
        workItems: { tags: ["regression", "release-blocker"] }
      }
    });
  });

  it("preserves an explicitly empty setFilters map so a clear-all patch can overwrite", () => {
    // Without this, the patch loses its `setFilters` key on the wire and the
    // backend's `incoming ?? current` merge would silently keep stale filters.
    expect(sanitizeUserPreferences({ setFilters: {} }).setFilters).toEqual({});
  });

  it("omits setFilters when the input has no setFilters key at all", () => {
    expect(sanitizeUserPreferences({ themeMode: "dark" }).setFilters).toBeUndefined();
  });
});

describe("sanitizeSetFilterPreference", () => {
  it("returns null for non-records and empty objects", () => {
    expect(sanitizeSetFilterPreference(null)).toBeNull();
    expect(sanitizeSetFilterPreference("string")).toBeNull();
    expect(sanitizeSetFilterPreference([])).toBeNull();
    expect(sanitizeSetFilterPreference({})).toBeNull();
    expect(
      sanitizeSetFilterPreference({ testCases: {}, workItems: {} })
    ).toBeNull();
  });

  it("strips lastOutcomes from the work-items column (not a valid axis there)", () => {
    const sanitized = sanitizeSetFilterPreference({
      workItems: { lastOutcomes: ["Failed"], states: ["Active"] }
    });
    expect(sanitized).toEqual({ workItems: { states: ["Active"] } });
  });

  it("trims and dedupes string lists, preserving first-seen order", () => {
    const sanitized = sanitizeSetFilterPreference({
      testCases: {
        states: [" Active ", "Active", "Closed", "  "],
        assignedTo: [42, "alice@example.com", "alice@example.com"]
      }
    });
    expect(sanitized).toEqual({
      testCases: {
        states: ["Active", "Closed"],
        assignedTo: ["alice@example.com"]
      }
    });
  });
});

describe("sanitizeSetPreference", () => {
  it("requires id, planId, rootSuiteId and queryId", () => {
    expect(
      sanitizeSetPreference({ id: "a", planId: "1", rootSuiteId: "10", queryId: "q-1" })
    ).toMatchObject({ id: "a", name: "a", planId: "1", rootSuiteId: "10", queryId: "q-1" });

    expect(sanitizeSetPreference({ id: "a", planId: "1", rootSuiteId: "10" })).toBeNull();
    expect(sanitizeSetPreference({})).toBeNull();
    expect(sanitizeSetPreference(null)).toBeNull();
  });

  it("preserves optional names and org/project", () => {
    const set = sanitizeSetPreference({
      id: "a",
      name: "Alpha",
      planId: "1",
      planName: "Plan One",
      rootSuiteId: "10",
      rootSuiteName: "Root",
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
      rootSuiteId: "10",
      rootSuiteName: "Root",
      queryId: "q-1",
      queryName: "Bugs",
      organization: "contoso",
      project: "delivery"
    });
  });
});
