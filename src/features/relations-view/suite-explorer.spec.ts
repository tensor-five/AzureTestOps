import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import { buildSuiteExplorerEntries, selectVisibleSuiteEntries } from "./suite-explorer.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";

const tree: TestSuiteNode = {
  id: 1,
  name: "Root",
  parentSuiteId: null,
  path: "Root",
  children: [
    { id: 2, name: "Empty", parentSuiteId: 1, path: "Root > Empty", children: [] },
    {
      id: 3,
      name: "Releases",
      parentSuiteId: 1,
      path: "Root > Releases",
      children: [
        { id: 4, name: "Login", parentSuiteId: 3, path: "Root > Releases > Login", children: [] }
      ]
    }
  ]
};

function projection(suiteId: number, title = "Case"): TestCaseProjection {
  return {
    workItemId: suiteId * 100,
    suiteId,
    suitePath: "Root",
    title,
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

function collapse(ids: number[]): SuiteCollapseApi {
  const set = new Set(ids.map(String));
  return {
    collapsedSuiteIds: set,
    isCollapsed: (id) => set.has(String(id)),
    toggle: () => undefined,
    collapseAll: () => undefined,
    expandAll: () => undefined
  };
}

describe("suite explorer", () => {
  it("hides empty branches while retaining ancestors of populated suites", () => {
    const entries = buildSuiteExplorerEntries(tree, [projection(4)], [projection(4)]);
    expect(entries.find((entry) => entry.suite.id === 1)?.branchProjectionCount).toBe(1);
    const visible = selectVisibleSuiteEntries(entries, collapse([]), {
      hideEmptySuites: true,
      searchQuery: ""
    });
    expect(visible.map((entry) => entry.suite.id)).toEqual([1, 3, 4]);
  });

  it("ignores collapsed parents while a search is active", () => {
    const entries = buildSuiteExplorerEntries(tree, [projection(4, "Login")], [projection(4, "Login")]);
    const visible = selectVisibleSuiteEntries(entries, collapse([3]), {
      hideEmptySuites: false,
      searchQuery: "login"
    });
    expect(visible.map((entry) => entry.suite.id)).toEqual([1, 3, 4]);
  });

  it("indexes children once for a large wide suite tree", () => {
    const childCount = 5_000;
    const wideTree: TestSuiteNode = {
      id: 1,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: Array.from({ length: childCount }, (_, index) => ({
        id: index + 2,
        name: `Suite ${index + 2}`,
        parentSuiteId: 1,
        path: `Root > Suite ${index + 2}`,
        children: []
      }))
    };

    const entries = buildSuiteExplorerEntries(wideTree, [], []);

    expect(entries).toHaveLength(childCount + 1);
    expect(entries[0].hasChildren).toBe(true);
    expect(entries.at(-1)?.hasChildren).toBe(false);
  });
});
