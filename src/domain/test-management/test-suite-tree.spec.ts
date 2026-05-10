import { describe, expect, it } from "vitest";

import {
  collectSuiteIds,
  findSuiteById,
  flattenSuiteTree,
  type TestSuiteNode
} from "./test-suite-tree.js";

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
      children: [
        { id: 4, name: "Auth", parentSuiteId: 2, path: "Root > API > Auth", children: [] }
      ]
    },
    {
      id: 3,
      name: "UI",
      parentSuiteId: 1,
      path: "Root > UI",
      children: []
    }
  ]
};

describe("test-suite-tree", () => {
  it("flattens depth-first with depth and path", () => {
    const flat = flattenSuiteTree(tree);
    expect(flat.map((entry) => entry.id)).toEqual([1, 2, 4, 3]);
    expect(flat.map((entry) => entry.depth)).toEqual([0, 1, 2, 1]);
    expect(flat.find((entry) => entry.id === 4)?.path).toBe("Root > API > Auth");
  });

  it("finds nested suites by id", () => {
    expect(findSuiteById(tree, 4)?.name).toBe("Auth");
    expect(findSuiteById(tree, 999)).toBeNull();
  });

  it("collects all ids", () => {
    expect(collectSuiteIds(tree)).toEqual([1, 2, 4, 3]);
  });
});
