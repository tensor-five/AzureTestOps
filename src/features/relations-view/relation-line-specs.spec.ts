import { describe, expect, it } from "vitest";

import {
  buildLineSpecs,
  buildSnapshotRelationSet,
  parseLineId,
  resolvePairFromItemKeys,
  type RelationStatusReader
} from "./relation-line-specs.js";
import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

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
    lastOutcome: "None",
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
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    ...overrides
  };
}

describe("buildSnapshotRelationSet", () => {
  it("returns an empty set for a null snapshot", () => {
    expect(buildSnapshotRelationSet(null).size).toBe(0);
  });

  it("links projections to work items present in the query (forward direction)", () => {
    const snapshot: ActiveSetSnapshot = {
      set: stubSet(),
      suiteTree: stubSuiteTree(),
      projections: [
        makeProjection({ workItemId: 100, relatedIds: [200, 999] }),
        makeProjection({ workItemId: 101, relatedIds: [] })
      ],
      workItemsFromQuery: [makeWorkItem({ id: 200 })],
      loadedAt: "2026-04-29T00:00:00.000Z"
    };

    const set = buildSnapshotRelationSet(snapshot);
    expect(set.has("100::200")).toBe(true);
    expect(set.has("100::999")).toBe(false); // 999 not in query
  });

  it("captures inverse links missing on the projection but present on the work item", () => {
    const snapshot: ActiveSetSnapshot = {
      set: stubSet(),
      suiteTree: stubSuiteTree(),
      projections: [makeProjection({ workItemId: 100, relatedIds: [] })],
      workItemsFromQuery: [makeWorkItem({ id: 200, relatedIds: [100] })],
      loadedAt: "2026-04-29T00:00:00.000Z"
    };

    expect(buildSnapshotRelationSet(snapshot).has("100::200")).toBe(true);
  });
});

describe("buildLineSpecs", () => {
  const reader = (related: ReadonlySet<string>, pending: ReadonlySet<string> = new Set()): RelationStatusReader => ({
    isRelated: (tcId, wiId) => related.has(`${tcId}::${wiId}`),
    isPending: (tcId, wiId) => pending.has(`${tcId}::${wiId}`)
  });

  it("emits one LineSpec per (testCase, workItem) pair flagged related", () => {
    const lines = buildLineSpecs(
      [makeProjection({ workItemId: 100, suiteId: 10 })],
      [makeWorkItem({ id: 200 }), makeWorkItem({ id: 201 })],
      reader(new Set(["100::200"]))
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      lineId: "tc:100:10->wi:200",
      testCaseItemKey: "tc:100:10",
      workItemItemKey: "wi:200",
      pending: false
    });
  });

  it("flags pending edges according to the mutations reader", () => {
    const [line] = buildLineSpecs(
      [makeProjection({ workItemId: 100, suiteId: 10 })],
      [makeWorkItem({ id: 200 })],
      reader(new Set(["100::200"]), new Set(["100::200"]))
    );
    expect(line.pending).toBe(true);
  });

  it("dedupes when the same Test Case appears in two suites linked to the same work item", () => {
    const lines = buildLineSpecs(
      [
        makeProjection({ workItemId: 100, suiteId: 10 }),
        makeProjection({ workItemId: 100, suiteId: 11 })
      ],
      [makeWorkItem({ id: 200 })],
      reader(new Set(["100::200"]))
    );
    // Same Test Case-id in two different suites yields two suite-distinct lineIds,
    // not a dedupe — distinct suites must each render their own line.
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((l) => l.lineId))).toEqual(
      new Set(["tc:100:10->wi:200", "tc:100:11->wi:200"])
    );
  });

  it("returns an empty array when no projections survive the filter", () => {
    expect(
      buildLineSpecs([], [makeWorkItem({ id: 200 })], reader(new Set(["100::200"])))
    ).toEqual([]);
  });
});

describe("resolvePairFromItemKeys", () => {
  it("resolves test-case + work-item regardless of input order", () => {
    expect(resolvePairFromItemKeys("tc:100:10", "wi:200")).toEqual({
      testCaseId: 100,
      workItemId: 200
    });
    expect(resolvePairFromItemKeys("wi:200", "tc:100:10")).toEqual({
      testCaseId: 100,
      workItemId: 200
    });
  });

  it("rejects same-kind pairs (tc + tc, wi + wi)", () => {
    expect(resolvePairFromItemKeys("tc:1:2", "tc:3:4")).toBeNull();
    expect(resolvePairFromItemKeys("wi:1", "wi:2")).toBeNull();
  });

  it("rejects unparseable keys", () => {
    expect(resolvePairFromItemKeys("garbage", "wi:1")).toBeNull();
    expect(resolvePairFromItemKeys("tc:1:2", "")).toBeNull();
  });
});

describe("parseLineId", () => {
  it("round-trips a buildLineSpecs lineId back to the (testCase, workItem) pair", () => {
    expect(parseLineId("tc:100:10->wi:200")).toEqual({
      testCaseId: 100,
      workItemId: 200
    });
  });

  it("returns null when the separator is missing", () => {
    expect(parseLineId("tc:100:10")).toBeNull();
    expect(parseLineId("")).toBeNull();
  });
});

function stubSet() {
  return {
    id: "set-1",
    name: "Sprint 24",
    planId: "1",
    rootSuiteId: "1",
    queryId: "q-1"
  };
}

function stubSuiteTree() {
  return {
    id: 1,
    name: "Root",
    path: "Root",
    parentSuiteId: null,
    depth: 0,
    children: [],
    testCaseIds: []
  };
}
