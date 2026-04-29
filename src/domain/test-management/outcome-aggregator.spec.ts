import { describe, expect, it } from "vitest";

import { aggregateTestCaseProjections } from "./outcome-aggregator.js";
import type { TestPoint } from "./test-point.js";
import type { TestResult } from "./test-result.js";
import type { TestSuiteFlatEntry } from "./test-suite-tree.js";
import type { WorkItem } from "../work-items/work-item.js";

const suite = (id: number, name: string, path: string): TestSuiteFlatEntry => ({
  id,
  name,
  parentSuiteId: null,
  path,
  depth: 0
});

const workItem = (id: number, overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  workItemType: "Test Case",
  title: `Test Case ${id}`,
  state: "Design",
  assignedTo: null,
  tags: [],
  areaPath: null,
  priority: null,
  relatedIds: [],
  ...overrides
});

const point = (
  pointId: number,
  workItemId: number,
  suiteId: number,
  overrides: Partial<TestPoint> = {}
): TestPoint => ({
  pointId,
  workItemId,
  suiteId,
  configurationId: 1,
  configurationName: "Default",
  lastRunId: null,
  lastResultId: null,
  lastOutcome: null,
  ...overrides
});

const result = (
  resultId: number,
  workItemId: number,
  suiteId: number | null,
  outcome: string,
  completedDate: string | null,
  runId = 100
): TestResult => ({
  resultId,
  runId,
  workItemId,
  suiteId,
  pointId: null,
  outcome,
  completedDate
});

describe("aggregateTestCaseProjections", () => {
  it("emits NotRun when no result matches", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, [point(1, 101, 10)]]]),
      results: [],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections).toHaveLength(1);
    expect(projections[0].lastOutcome).toBe("NotRun");
    expect(projections[0].lastResultId).toBeNull();
    expect(projections[0].testPointId).toBe(1);
  });

  it("picks the result with the latest completedDate per (workItemId, suiteId)", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, [point(1, 101, 10)]]]),
      results: [
        result(900, 101, 10, "Failed", "2026-01-15T08:00:00Z"),
        result(901, 101, 10, "Passed", "2026-02-20T08:00:00Z"),
        result(902, 101, 10, "Blocked", "2026-01-10T08:00:00Z")
      ],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections).toHaveLength(1);
    expect(projections[0].lastOutcome).toBe("Passed");
    expect(projections[0].lastResultId).toBe(901);
    expect(projections[0].lastResultCompletedDate).toBe("2026-02-20T08:00:00Z");
  });

  it("ignores results with null completedDate or null suiteId", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, [point(1, 101, 10)]]]),
      results: [
        result(900, 101, 10, "Failed", null),
        result(901, 101, null, "Passed", "2026-02-20T08:00:00Z")
      ],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections[0].lastOutcome).toBe("NotRun");
  });

  it("produces a separate projection per suite the test case is in", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [
        suite(10, "Smoke", "Root > Smoke"),
        suite(20, "Regression", "Root > Regression")
      ],
      testCasesBySuiteId: new Map([
        [10, [101]],
        [20, [101]]
      ]),
      pointsBySuiteId: new Map([
        [10, [point(1, 101, 10)]],
        [20, [point(2, 101, 20)]]
      ]),
      results: [
        result(900, 101, 10, "Passed", "2026-02-20T08:00:00Z"),
        result(901, 101, 20, "Failed", "2026-02-21T08:00:00Z")
      ],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections).toHaveLength(2);
    expect(projections.find((p) => p.suiteId === 10)?.lastOutcome).toBe("Passed");
    expect(projections.find((p) => p.suiteId === 20)?.lastOutcome).toBe("Failed");
  });

  it("drops test cases without a hydrated work item", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101, 102]]]),
      pointsBySuiteId: new Map([
        [10, [point(1, 101, 10), point(2, 102, 10)]]
      ]),
      results: [],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections).toHaveLength(1);
    expect(projections[0].workItemId).toBe(101);
  });

  it("falls back to point.lastOutcome when no result matched the (workItemId, suiteId)", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([
        [10, [point(1, 101, 10, { lastOutcome: "Passed", lastRunId: 555, lastResultId: 999 })]]
      ]),
      // Result has no testSuite.id — Azure sometimes drops the link, so the
      // join fails and only the point's published outcome remains.
      results: [result(900, 101, null, "Failed", "2026-02-20T08:00:00Z")],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections[0].lastOutcome).toBe("Passed");
    expect(projections[0].lastResultId).toBe(999);
    expect(projections[0].lastRunId).toBe(555);
  });

  it("uses millisecond precision when picking the latest completedDate", () => {
    // Mixing `…Z` and `….123Z` ISO forms breaks lexicographic compare — `Z`
    // (0x5A) sorts after `.` (0x2E), so the no-millis form would win even
    // though it is chronologically earlier.
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, [point(1, 101, 10)]]]),
      results: [
        result(900, 101, 10, "Failed", "2026-02-20T08:00:00Z"),
        result(901, 101, 10, "Passed", "2026-02-20T08:00:00.500Z")
      ],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections[0].lastResultId).toBe(901);
    expect(projections[0].lastOutcome).toBe("Passed");
  });

  it("falls back to point.lastRunId when there is no result yet", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Smoke", "Root > Smoke")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, [point(1, 101, 10, { lastRunId: 555 })]]]),
      results: [],
      workItemsById: new Map([[101, workItem(101)]])
    });

    expect(projections[0].lastRunId).toBe(555);
  });

  it("carries suite path and work item fields onto the projection", () => {
    const projections = aggregateTestCaseProjections({
      suiteEntries: [suite(10, "Auth", "Root > API > Auth")],
      testCasesBySuiteId: new Map([[10, [101]]]),
      pointsBySuiteId: new Map([[10, []]]),
      results: [],
      workItemsById: new Map([
        [
          101,
          workItem(101, {
            title: "Login redirects to dashboard",
            state: "Ready",
            tags: ["smoke", "auth"],
            assignedTo: "Alice",
            priority: 2,
            relatedIds: [9001]
          })
        ]
      ])
    });

    expect(projections[0].suitePath).toBe("Root > API > Auth");
    expect(projections[0].title).toBe("Login redirects to dashboard");
    expect(projections[0].tags).toEqual(["smoke", "auth"]);
    expect(projections[0].assignedTo).toBe("Alice");
    expect(projections[0].priority).toBe(2);
    expect(projections[0].relatedIds).toEqual([9001]);
  });
});
