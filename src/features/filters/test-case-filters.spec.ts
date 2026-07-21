import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { extractTestCaseFacets, filterTestCases } from "./test-case-filters.js";

function projection(over: Partial<TestCaseProjection> = {}): TestCaseProjection {
  return {
    workItemId: 1,
    suiteId: 100,
    suitePath: "Root > A",
    title: "Login fails on locked account",
    state: "Active",
    workItemType: "Test Case",
    assignedTo: "alice@example.com",
    tags: ["auth", "regression"],
    areaPath: null,
    priority: 2,
    relatedIds: [],
    testPointId: null,
    configurationId: null,
    configurationName: null,
    lastOutcome: "Failed",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null,
    ...over
  };
}

describe("filterTestCases", () => {
  it("returns a copy of the input when no filter is provided", () => {
    const input = [projection({ workItemId: 1 }), projection({ workItemId: 2 })];
    const result = filterTestCases(input, undefined);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("treats an all-empty filter as no-op", () => {
    const input = [projection({ workItemId: 1 })];
    const result = filterTestCases(input, {
      titleQuery: "   ",
      states: [],
      lastOutcomes: []
    });
    expect(result).toEqual(input);
  });

  it("matches title case-insensitively as a substring", () => {
    const a = projection({ workItemId: 1, title: "Login flow on locked account" });
    const b = projection({ workItemId: 2, title: "Search ranking" });
    const result = filterTestCases([a, b], { titleQuery: "LOGIN" });
    expect(result).toEqual([a]);
  });

  it("matches the suite path so one search covers suites and test-case titles", () => {
    const release = projection({
      workItemId: 1,
      title: "Generic case",
      suitePath: "Plan > Releases > Login"
    });
    const billing = projection({
      workItemId: 2,
      title: "Another case",
      suitePath: "Plan > Billing"
    });
    expect(filterTestCases([release, billing], { titleQuery: "releases" })).toEqual([release]);
  });

  it("ANDs facets together while ORing within a facet", () => {
    const a = projection({ workItemId: 1, lastOutcome: "Failed", state: "Active" });
    const b = projection({ workItemId: 2, lastOutcome: "Passed", state: "Active" });
    const c = projection({ workItemId: 3, lastOutcome: "Failed", state: "Closed" });
    const result = filterTestCases([a, b, c], {
      lastOutcomes: ["Failed", "NotRun"],
      states: ["Active"]
    });
    expect(result).toEqual([a]);
  });

  it("excludes projections without an assignee when assignedTo is configured", () => {
    const a = projection({ workItemId: 1, assignedTo: "alice@example.com" });
    const b = projection({ workItemId: 2, assignedTo: null });
    const c = projection({ workItemId: 3, assignedTo: "bob@example.com" });
    const result = filterTestCases([a, b, c], {
      assignedTo: ["alice@example.com", "bob@example.com"]
    });
    expect(result).toEqual([a, c]);
  });

  it("matches a tag if any of the projection tags is in the filter set", () => {
    const a = projection({ workItemId: 1, tags: ["auth", "regression"] });
    const b = projection({ workItemId: 2, tags: ["ui"] });
    const result = filterTestCases([a, b], { tags: ["regression", "release-blocker"] });
    expect(result).toEqual([a]);
  });

  it("filters by workItemType when configured", () => {
    const a = projection({ workItemId: 1, workItemType: "Test Case" });
    const b = projection({ workItemId: 2, workItemType: "Shared Steps" });
    const result = filterTestCases([a, b], { workItemTypes: ["Test Case"] });
    expect(result).toEqual([a]);
  });
});

describe("extractTestCaseFacets", () => {
  it("collects distinct values per axis, sorted case-insensitively", () => {
    const projections = [
      projection({
        workItemId: 1,
        lastOutcome: "Failed",
        state: "Active",
        assignedTo: "alice@example.com",
        tags: ["regression", "auth"],
        workItemType: "Test Case"
      }),
      projection({
        workItemId: 2,
        lastOutcome: "Passed",
        state: "Resolved",
        assignedTo: null,
        tags: ["regression"],
        workItemType: "Test Case"
      }),
      projection({
        workItemId: 3,
        lastOutcome: "Failed",
        state: "Closed",
        assignedTo: "bob@example.com",
        tags: [],
        workItemType: "Shared Steps"
      })
    ];
    const facets = extractTestCaseFacets(projections);

    expect(facets).toEqual({
      lastOutcomes: ["Failed", "Passed"],
      states: ["Active", "Closed", "Resolved"],
      assignedTo: ["alice@example.com", "bob@example.com"],
      tags: ["auth", "regression"],
      workItemTypes: ["Shared Steps", "Test Case"]
    });
  });
});
