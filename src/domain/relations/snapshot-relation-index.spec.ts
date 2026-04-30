import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../test-management/test-case-projection.js";
import type { WorkItem } from "../work-items/work-item.js";

import {
  buildSnapshotRelationIndex,
  isRelationLinkedInSnapshot,
  snapshotRelationKey
} from "./snapshot-relation-index.js";

function makeProjection(
  overrides: Partial<TestCaseProjection> = {}
): TestCaseProjection {
  return {
    workItemId: 1,
    suiteId: 100,
    suitePath: "Plan/Suite",
    title: "Test",
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
    lastOutcome: "None",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null,
    ...overrides
  };
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1000,
    workItemType: "Bug",
    title: "Bug",
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    ...overrides
  };
}

describe("buildSnapshotRelationIndex", () => {
  it("returns an empty index for empty inputs", () => {
    expect(buildSnapshotRelationIndex([], [])).toEqual(new Set());
  });

  it("links pairs where the test-case projection holds the relatedId", () => {
    const index = buildSnapshotRelationIndex(
      [makeProjection({ workItemId: 1, relatedIds: [1000] })],
      [makeWorkItem({ id: 1000 })]
    );
    expect(index.has(snapshotRelationKey(1, 1000))).toBe(true);
  });

  it("links pairs where the work item carries the inverse relatedId", () => {
    const index = buildSnapshotRelationIndex(
      [makeProjection({ workItemId: 1, relatedIds: [] })],
      [makeWorkItem({ id: 1000, relatedIds: [1] })]
    );
    expect(index.has(snapshotRelationKey(1, 1000))).toBe(true);
  });

  it("ignores dangling references whose other endpoint is missing", () => {
    const index = buildSnapshotRelationIndex(
      [makeProjection({ workItemId: 1, relatedIds: [9999] })],
      [makeWorkItem({ id: 1000 })]
    );
    expect(index.has(snapshotRelationKey(1, 9999))).toBe(false);
  });

  it("deduplicates a pair that appears on both sides", () => {
    const index = buildSnapshotRelationIndex(
      [makeProjection({ workItemId: 1, relatedIds: [1000] })],
      [makeWorkItem({ id: 1000, relatedIds: [1] })]
    );
    expect(index.size).toBe(1);
  });
});

describe("isRelationLinkedInSnapshot", () => {
  it("returns false when no projection matches the test-case id", () => {
    expect(
      isRelationLinkedInSnapshot([], [makeWorkItem({ id: 1000 })], 1, 1000)
    ).toBe(false);
  });

  it("returns false when no work item matches the work-item id", () => {
    expect(
      isRelationLinkedInSnapshot(
        [makeProjection({ workItemId: 1, relatedIds: [1000] })],
        [],
        1,
        1000
      )
    ).toBe(false);
  });

  it("returns true when either side carries the relatedId", () => {
    expect(
      isRelationLinkedInSnapshot(
        [makeProjection({ workItemId: 1, relatedIds: [1000] })],
        [makeWorkItem({ id: 1000 })],
        1,
        1000
      )
    ).toBe(true);

    expect(
      isRelationLinkedInSnapshot(
        [makeProjection({ workItemId: 1, relatedIds: [] })],
        [makeWorkItem({ id: 1000, relatedIds: [1] })],
        1,
        1000
      )
    ).toBe(true);
  });
});
