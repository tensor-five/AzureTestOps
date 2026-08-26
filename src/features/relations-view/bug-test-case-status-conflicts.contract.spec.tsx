import { describe, expect, it } from "vitest";

import { buildRelationAdjacencyIndex } from "../../domain/relations/snapshot-relation-index.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import {
  buildLineSpecs,
  type RelationStatusReader
} from "./relation-line-specs.js";

type ConflictAwareLineSpec = ReturnType<typeof buildLineSpecs>[number] & { conflict?: boolean };

const RELATED = new Set(["100::200"]);

describe("Bug-Test-Case-Statuskonflikte Vertrag v2", () => {
  it.each([
    ["BSC-01", "New", "Passed"],
    ["BSC-02", "Active", "Passed"],
    ["BSC-03", "Resolved", "Failed"],
    ["BSC-04", "Closed", "Failed"],
    ["BSC-05", "Resolved", "Blocked"],
    ["BSC-06", "Closed", "Blocked"]
  ] as const)("%s kennzeichnet %s und %s als Konflikt", (_requirement, state, outcome) => {
    expect(lineFor(state, outcome).conflict).toBe(true);
  });

  it("BSC-09 markiert alle 18 nicht vereinbarten Kombinationen nicht als Konflikt", () => {
    for (const [state, outcome] of [
      ["New", "Failed"],
      ["New", "Blocked"],
      ["New", "NotApplicable"],
      ["New", "Paused"],
      ["New", "Unspecified"],
      ["Active", "Failed"],
      ["Active", "Blocked"],
      ["Active", "NotApplicable"],
      ["Active", "Paused"],
      ["Active", "Unspecified"],
      ["Resolved", "Passed"],
      ["Resolved", "NotApplicable"],
      ["Resolved", "Paused"],
      ["Resolved", "Unspecified"],
      ["Closed", "Passed"],
      ["Closed", "NotApplicable"],
      ["Closed", "Paused"],
      ["Closed", "Unspecified"]
    ]) {
      expect(lineFor(state, outcome).conflict).toBe(false);
    }
  });

});

function lineFor(state: string, outcome: string): ConflictAwareLineSpec {
  const [line] = buildLineSpecs(
    [makeProjection({ lastOutcome: outcome })],
    [makeWorkItem({ state })],
    relationReader()
  );
  if (!line) {
    throw new Error("The test fixture must produce one visible relation line.");
  }
  return line;
}

function relationReader(): RelationStatusReader {
  return {
    relationIndex: buildRelationAdjacencyIndex(RELATED),
    isPending: () => false
  };
}

function makeProjection(overrides: Partial<TestCaseProjection> = {}): TestCaseProjection {
  return {
    workItemId: 100,
    suiteId: 10,
    suitePath: "Suite/Sub",
    title: "TC",
    state: "Design",
    workItemType: "Test Case",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    testPointId: null,
    configurationId: null,
    configurationName: null,
    lastOutcome: "Unspecified",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null,
    ...overrides
  };
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 200,
    workItemType: "Bug",
    title: "Bug",
    state: "New",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    ...overrides
  };
}
