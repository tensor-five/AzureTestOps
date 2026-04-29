import { describe, expect, it } from "vitest";

import {
  loadTestCaseProjections,
  type LoadTestCaseProjectionsDeps
} from "./load-test-case-projections.use-case.js";
import type { TestPoint } from "../../domain/test-management/test-point.js";
import type { TestResult } from "../../domain/test-management/test-result.js";
import type { TestRun } from "../../domain/test-management/test-run.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

describe("loadTestCaseProjections", () => {
  it("composes suite-tree + cases + points + runs + results into projections", async () => {
    const tree: TestSuiteNode = {
      id: 1,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: [
        {
          id: 2,
          name: "API",
          parentSuiteId: 1,
          path: "Root > API",
          children: []
        }
      ]
    };

    const casesBySuite = new Map<number, number[]>([
      [1, [101]],
      [2, [101, 102]]
    ]);

    const pointsBySuite = new Map<number, TestPoint[]>([
      [1, [{ pointId: 11, workItemId: 101, suiteId: 1, configurationId: 1, configurationName: "Default", lastRunId: null, lastResultId: null, lastOutcome: null }]],
      [
        2,
        [
          { pointId: 21, workItemId: 101, suiteId: 2, configurationId: 1, configurationName: "Default", lastRunId: null, lastResultId: null, lastOutcome: null },
          { pointId: 22, workItemId: 102, suiteId: 2, configurationId: 1, configurationName: "Default", lastRunId: null, lastResultId: null, lastOutcome: null }
        ]
      ]
    ]);

    const runs: TestRun[] = [
      { runId: 5000, name: "CI #42", planId: 9, state: "Completed", startedDate: null, completedDate: null, totalTests: 3, passedTests: 2, isAutomated: true }
    ];

    const results: TestResult[] = [
      { resultId: 7001, runId: 5000, workItemId: 101, suiteId: 2, pointId: 21, outcome: "Passed", completedDate: "2026-03-01T10:00:00Z" },
      { resultId: 7002, runId: 5000, workItemId: 102, suiteId: 2, pointId: 22, outcome: "Failed", completedDate: "2026-03-01T10:05:00Z" }
    ];

    const workItems = new Map<number, WorkItem>([
      [101, { id: 101, workItemType: "Test Case", title: "Login", state: "Ready", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] }],
      [102, { id: 102, workItemType: "Test Case", title: "Logout", state: "Ready", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] }]
    ]);

    const deps: LoadTestCaseProjectionsDeps = {
      testManagement: {
        loadSuiteTree: async () => tree,
        listTestCasesInSuite: async (_, suiteId) => casesBySuite.get(suiteId) ?? [],
        loadPointsForSuite: async (_, suiteId) => pointsBySuite.get(suiteId) ?? [],
        listRunsForPlan: async () => runs,
        loadResultsForRun: async (runId) => results.filter((r) => r.runId === runId)
      },
      workItemHydration: {
        hydrateWorkItems: async (ids) => {
          const map = new Map<number, WorkItem>();
          for (const id of ids) {
            const wi = workItems.get(id);
            if (wi) {
              map.set(id, wi);
            }
          }
          return map;
        }
      },
      concurrency: 4
    };

    const result = await loadTestCaseProjections({ planId: 9, rootSuiteId: 1 }, deps);

    expect(result.suiteTree).toBe(tree);
    // Test Case 101 lives in suites 1 and 2 → two projections; 102 only in suite 2 → one projection
    expect(result.projections).toHaveLength(3);

    const projection101InSuite1 = result.projections.find(
      (p) => p.workItemId === 101 && p.suiteId === 1
    );
    const projection101InSuite2 = result.projections.find(
      (p) => p.workItemId === 101 && p.suiteId === 2
    );
    const projection102InSuite2 = result.projections.find(
      (p) => p.workItemId === 102 && p.suiteId === 2
    );

    expect(projection101InSuite1?.lastOutcome).toBe("NotRun");
    expect(projection101InSuite2?.lastOutcome).toBe("Passed");
    expect(projection102InSuite2?.lastOutcome).toBe("Failed");
    expect(projection101InSuite2?.suitePath).toBe("Root > API");
  });

  it("handles plans without runs without crashing", async () => {
    const tree: TestSuiteNode = {
      id: 1,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: []
    };

    const deps: LoadTestCaseProjectionsDeps = {
      testManagement: {
        loadSuiteTree: async () => tree,
        listTestCasesInSuite: async () => [101],
        loadPointsForSuite: async () => [],
        listRunsForPlan: async () => [],
        loadResultsForRun: async () => []
      },
      workItemHydration: {
        hydrateWorkItems: async () =>
          new Map<number, WorkItem>([
            [101, { id: 101, workItemType: "Test Case", title: "Login", state: "Ready", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] }]
          ])
      }
    };

    const result = await loadTestCaseProjections({ planId: 9, rootSuiteId: 1 }, deps);
    expect(result.projections).toHaveLength(1);
    expect(result.projections[0].lastOutcome).toBe("NotRun");
  });
});
