import { describe, expect, it } from "vitest";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { extractWorkItemFacets, filterWorkItems } from "./work-item-filters.js";

function workItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 100,
    workItemType: "Bug",
    title: "Login button is disabled on lockout",
    state: "New",
    assignedTo: "alice@example.com",
    tags: ["auth"],
    areaPath: null,
    priority: 2,
    relatedIds: [],
    ...over
  };
}

describe("filterWorkItems", () => {
  it("returns a copy of the input when no filter is provided", () => {
    const input = [workItem({ id: 1 }), workItem({ id: 2 })];
    const result = filterWorkItems(input, undefined);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("matches the title substring case-insensitively", () => {
    const a = workItem({ id: 1, title: "Token rotation" });
    const b = workItem({ id: 2, title: "Search performance" });
    const result = filterWorkItems([a, b], { titleQuery: "TOKEN" });
    expect(result).toEqual([a]);
  });

  it("intersects multiple axes (AND across, OR within)", () => {
    const a = workItem({ id: 1, state: "New", workItemType: "Bug" });
    const b = workItem({ id: 2, state: "Closed", workItemType: "Bug" });
    const c = workItem({ id: 3, state: "New", workItemType: "User Story" });
    const result = filterWorkItems([a, b, c], {
      states: ["New", "Active"],
      workItemTypes: ["Bug"]
    });
    expect(result).toEqual([a]);
  });

  it("excludes items without an assignee when assignedTo is configured", () => {
    const a = workItem({ id: 1, assignedTo: "alice@example.com" });
    const b = workItem({ id: 2, assignedTo: null });
    const result = filterWorkItems([a, b], { assignedTo: ["alice@example.com"] });
    expect(result).toEqual([a]);
  });

  it("matches a tag if any item tag is in the filter set", () => {
    const a = workItem({ id: 1, tags: ["release-blocker"] });
    const b = workItem({ id: 2, tags: ["minor"] });
    const result = filterWorkItems([a, b], { tags: ["release-blocker"] });
    expect(result).toEqual([a]);
  });
});

describe("extractWorkItemFacets", () => {
  it("returns sorted distinct values across all axes", () => {
    const items = [
      workItem({
        id: 1,
        state: "New",
        assignedTo: "alice@example.com",
        tags: ["regression"],
        workItemType: "Bug"
      }),
      workItem({
        id: 2,
        state: "Closed",
        assignedTo: null,
        tags: ["regression", "minor"],
        workItemType: "Bug"
      }),
      workItem({
        id: 3,
        state: "Active",
        assignedTo: "bob@example.com",
        tags: [],
        workItemType: "User Story"
      })
    ];

    const facets = extractWorkItemFacets(items);
    expect(facets).toEqual({
      states: ["Active", "Closed", "New"],
      assignedTo: ["alice@example.com", "bob@example.com"],
      tags: ["minor", "regression"],
      workItemTypes: ["Bug", "User Story"]
    });
  });
});
