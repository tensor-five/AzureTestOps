import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import {
  buildRelationAdjacencyIndex,
  snapshotRelationKey
} from "../../domain/relations/snapshot-relation-index.js";
import {
  buildRelationSummary,
  filterOpenBugs,
  filterProjectionsByRelationVisibility,
  filterWorkItemsByRelationVisibility,
  resolveFocusedWorkItemIds
} from "./relations-view-controls.js";

const projection = (workItemId: number, suiteId: number): TestCaseProjection => ({
  workItemId,
  suiteId,
  suitePath: "Root",
  title: `Test ${workItemId}`,
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
});

const item = (id: number, state = "Active", type = "Bug"): WorkItem => ({
  id,
  title: `Item ${id}`,
  state,
  workItemType: type,
  assignedTo: null,
  tags: [],
  areaPath: null,
  priority: null,
  relatedIds: []
});

const relationIndex = buildRelationAdjacencyIndex(new Set([
  snapshotRelationKey(1, 10)
]));

describe("relations view controls", () => {
  it("filters either side to linked or unlinked entries", () => {
    const projections = [projection(1, 5), projection(2, 6)];
    const workItems = [item(10), item(20)];
    expect(filterProjectionsByRelationVisibility(projections, workItems, "linked", relationIndex))
      .toEqual([projections[0]]);
    expect(filterWorkItemsByRelationVisibility(workItems, projections, "unlinked", relationIndex))
      .toEqual([workItems[1]]);
  });

  it("keeps only non-terminal bugs for the open-bugs preset", () => {
    expect(filterOpenBugs([item(1), item(2, "Closed"), item(3, "Active", "Task")], true))
      .toEqual([item(1)]);
  });

  it("resolves work items connected to the focused suite", () => {
    const branchIndex = buildRelationAdjacencyIndex(new Set([
      snapshotRelationKey(1, 10),
      snapshotRelationKey(2, 20)
    ]));
    const result = resolveFocusedWorkItemIds(
      new Set([5, 6]),
      [projection(1, 5), projection(2, 6)],
      [item(10), item(20)],
      branchIndex
    );
    expect([...result]).toEqual([10, 20]);
  });

  it("summarizes unique relations and unlinked endpoints", () => {
    expect(buildRelationSummary(
      [projection(1, 5), projection(1, 6), projection(2, 6)],
      [item(10), item(20)],
      relationIndex
    )).toEqual({
      relationCount: 1,
      unlinkedTestCaseCount: 1,
      unlinkedWorkItemCount: 1
    });
  });
});
