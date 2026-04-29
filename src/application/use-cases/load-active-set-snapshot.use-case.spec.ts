import { describe, expect, it, vi } from "vitest";

import {
  AdoContextMissingError,
  InvalidSetIdentifierError,
  loadActiveSetSnapshot,
  NoActiveSetError,
  SetNotFoundError,
  type LoadActiveSetSnapshotDeps
} from "./load-active-set-snapshot.use-case.js";

import type { Set } from "../../domain/sets/set.js";
import type { TestPoint } from "../../domain/test-management/test-point.js";
import type { TestResult } from "../../domain/test-management/test-result.js";
import type { TestRun } from "../../domain/test-management/test-run.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";
import type { TestManagementReadPort } from "../ports/test-management.port.js";
import type { WorkItemHydrationPort } from "../ports/work-item-hydration.port.js";
import type { SavedQueryPort } from "../ports/saved-query.port.js";
import type { AdoContextPort } from "../ports/ado-context.port.js";

describe("loadActiveSetSnapshot", () => {
  it("composes Phase 2 + Phase 3 into a snapshot for the active set", async () => {
    const set: Set = {
      id: "s1",
      name: "Sprint 24",
      planId: "9",
      rootSuiteId: "1",
      queryId: "Q-A"
    };

    const tree: TestSuiteNode = {
      id: 1,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: []
    };
    const run: TestRun = {
      runId: 5000,
      name: "CI",
      planId: 9,
      state: "Completed",
      startedDate: null,
      completedDate: null,
      totalTests: 1,
      passedTests: 1,
      isAutomated: true
    };
    const result: TestResult = {
      resultId: 7001,
      runId: 5000,
      testCaseReferenceId: 101,
      suiteId: 1,
      pointId: 11,
      outcome: "Passed",
      completedDate: "2026-04-01T10:00:00Z"
    };
    const point: TestPoint = {
      pointId: 11,
      workItemId: 101,
      suiteId: 1,
      configurationId: 1,
      configurationName: "Default",
      lastRunId: null,
      lastResultId: null
    };

    const testCase: WorkItem = {
      id: 101,
      workItemType: "Test Case",
      title: "Login",
      state: "Ready",
      assignedTo: null,
      tags: [],
      areaPath: null,
      priority: null,
      relatedIds: [201]
    };
    const bug: WorkItem = {
      id: 201,
      workItemType: "Bug",
      title: "Login broken",
      state: "Active",
      assignedTo: null,
      tags: [],
      areaPath: null,
      priority: null,
      relatedIds: [101]
    };

    const repo = stubSetRepo(set, "s1");
    const testManagement: TestManagementReadPort = {
      loadSuiteTree: vi.fn(async () => tree),
      listTestCasesInSuite: vi.fn(async () => [101]),
      loadPointsForSuite: vi.fn(async () => [point]),
      listRunsForPlan: vi.fn(async () => [run]),
      loadResultsForRun: vi.fn(async () => [result])
    };
    const workItemHydration: WorkItemHydrationPort = {
      hydrateWorkItems: vi.fn(async (ids) => {
        const map = new Map<number, WorkItem>();
        for (const id of ids) {
          if (id === 101) map.set(id, testCase);
          if (id === 201) map.set(id, bug);
        }
        return map;
      })
    };
    const savedQuery: SavedQueryPort = {
      listSavedQueries: vi.fn(async () => []),
      executeQuery: vi.fn(async () => ({ workItemIds: [201], relations: [] }))
    };

    const deps: LoadActiveSetSnapshotDeps = {
      setRepository: repo,
      testManagement,
      workItemHydration,
      savedQuery,
      now: () => new Date("2026-04-29T12:00:00Z")
    };

    const snapshot = await loadActiveSetSnapshot({}, deps);

    expect(snapshot.set).toEqual(set);
    expect(snapshot.suiteTree).toBe(tree);
    expect(snapshot.projections).toHaveLength(1);
    expect(snapshot.projections[0].lastOutcome).toBe("Passed");
    expect(snapshot.workItemsFromQuery).toEqual([bug]);
    expect(snapshot.loadedAt).toBe("2026-04-29T12:00:00.000Z");

    expect(testManagement.loadSuiteTree).toHaveBeenCalledWith(9, 1);
    expect(savedQuery.executeQuery).toHaveBeenCalledWith("Q-A");
  });

  it("uses an explicit setId override when supplied", async () => {
    const set: Set = { id: "override", name: "n", planId: "1", rootSuiteId: "1", queryId: "q" };
    const repo = stubSetRepo(set, null);
    const deps = baseDeps(repo);

    await loadActiveSetSnapshot({ setId: "override" }, deps);
    expect(repo.getById).toHaveBeenCalledWith("override");
  });

  it("throws NoActiveSetError when neither override nor active id is set", async () => {
    const repo = stubSetRepo(null, null);
    await expect(loadActiveSetSnapshot({}, baseDeps(repo))).rejects.toBeInstanceOf(
      NoActiveSetError
    );
  });

  it("throws SetNotFoundError when the resolved id is missing", async () => {
    const repo = stubSetRepo(null, "ghost");
    await expect(loadActiveSetSnapshot({}, baseDeps(repo))).rejects.toBeInstanceOf(
      SetNotFoundError
    );
  });

  it("throws InvalidSetIdentifierError for non-numeric planId / rootSuiteId", async () => {
    const set: Set = { id: "bad", name: "n", planId: "abc", rootSuiteId: "1", queryId: "q" };
    const repo = stubSetRepo(set, "bad");
    await expect(loadActiveSetSnapshot({}, baseDeps(repo))).rejects.toBeInstanceOf(
      InvalidSetIdentifierError
    );
  });

  it("fails fast with AdoContextMissingError when the context port returns null", async () => {
    const set: Set = { id: "s1", name: "n", planId: "1", rootSuiteId: "1", queryId: "q" };
    const repo = stubSetRepo(set, "s1");
    const adoContext: AdoContextPort = {
      getContext: async () => null,
      setContext: async (ctx) => ctx
    };
    await expect(
      loadActiveSetSnapshot({}, { ...baseDeps(repo), adoContext })
    ).rejects.toBeInstanceOf(AdoContextMissingError);
  });
});

function stubSetRepo(
  set: Set | null,
  activeId: string | null
): SetRepositoryPort & { getById: ReturnType<typeof vi.fn> } {
  const getById = vi.fn(async (id: string) => (set && set.id === id ? set : null));
  return {
    listSets: async () => (set ? [set] : []),
    getById,
    create: async () => set ?? throwHere(),
    update: async () => set ?? throwHere(),
    delete: async () => undefined,
    getActiveId: async () => activeId,
    setActiveId: async () => undefined
  } as unknown as SetRepositoryPort & { getById: ReturnType<typeof vi.fn> };
}

function throwHere(): never {
  throw new Error("not used in this test");
}

function baseDeps(repo: SetRepositoryPort): LoadActiveSetSnapshotDeps {
  return {
    setRepository: repo,
    testManagement: {
      loadSuiteTree: async () => ({ id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] }),
      listTestCasesInSuite: async () => [],
      loadPointsForSuite: async () => [],
      listRunsForPlan: async () => [],
      loadResultsForRun: async () => []
    },
    workItemHydration: {
      hydrateWorkItems: async () => new Map()
    },
    savedQuery: {
      listSavedQueries: async () => [],
      executeQuery: async () => ({ workItemIds: [], relations: [] })
    },
    now: () => new Date("2026-04-29T12:00:00Z")
  };
}
