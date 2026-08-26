import { describe, expect, it } from "vitest";

import { buildRelationAdjacencyIndex } from "../../domain/relations/snapshot-relation-index.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import { resolveRelationCardFocus } from "./relation-card-focus.js";

const projections = [testCase(101), testCase(102), testCase(103)];
const workItems = [bug(501), bug(502), bug(503)];
const relationIndex = buildRelationAdjacencyIndex(new Set([
  "101::501",
  "101::503",
  "102::501",
  "102::502"
]));

describe("resolveRelationCardFocus", () => {
  it("resolves every directly related Bug and only its relations for a focused Test Case", () => {
    const focus = resolveRelationCardFocus(
      { kind: "test-case", workItemId: 101 },
      projections,
      workItems,
      relationIndex
    );

    expect(focus.testCaseIds).toEqual(new Set([101]));
    expect(focus.workItemIds).toEqual(new Set([501, 503]));
    expect(focus.relationKeys).toEqual(new Set(["101::501", "101::503"]));
  });

  it("resolves every directly related Test Case and only its relations for a focused Bug", () => {
    const focus = resolveRelationCardFocus(
      { kind: "work-item", workItemId: 501 },
      projections,
      workItems,
      relationIndex
    );

    expect(focus.testCaseIds).toEqual(new Set([101, 102]));
    expect(focus.workItemIds).toEqual(new Set([501]));
    expect(focus.relationKeys).toEqual(new Set(["101::501", "102::501"]));
  });

  it("returns no focus when the target is no longer visible", () => {
    const focus = resolveRelationCardFocus(
      { kind: "test-case", workItemId: 999 },
      projections,
      workItems,
      relationIndex
    );

    expect(focus.testCaseIds.size).toBe(0);
    expect(focus.workItemIds.size).toBe(0);
    expect(focus.relationKeys.size).toBe(0);
  });
});

function testCase(workItemId: number): TestCaseProjection {
  return {
    workItemId,
    suiteId: 1,
    suitePath: "Payments",
    title: "Payment test",
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
    lastOutcome: "Passed",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

function bug(id: number): WorkItem {
  return {
    id,
    workItemType: "Bug",
    title: "Payment bug",
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: []
  };
}
