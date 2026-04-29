import { describe, expect, it, vi } from "vitest";

import { runSavedQuery } from "./run-saved-query.use-case.js";
import type { SavedQueryPort } from "../ports/saved-query.port.js";
import type { WorkItemHydrationPort } from "../ports/work-item-hydration.port.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

const buildItem = (id: number): WorkItem => ({
  id,
  workItemType: "Bug",
  title: `Bug ${id}`,
  state: "Active",
  assignedTo: null,
  tags: [],
  areaPath: null,
  priority: null,
  relatedIds: []
});

describe("runSavedQuery", () => {
  it("executes the query and returns hydrated work items in query order", async () => {
    const savedQuery: SavedQueryPort = {
      listSavedQueries: vi.fn(),
      executeQuery: vi.fn(async () => ({
        workItemIds: [101, 102, 103],
        relations: [{ rel: "System.LinkTypes.Hierarchy-Forward" }]
      }))
    };
    const workItemHydration: WorkItemHydrationPort = {
      hydrateWorkItems: vi.fn(async (ids: number[]) =>
        new Map<number, WorkItem>(ids.map((id) => [id, buildItem(id)] as const))
      )
    };

    const result = await runSavedQuery({ queryId: "abc" }, { savedQuery, workItemHydration });

    expect(savedQuery.executeQuery).toHaveBeenCalledWith("abc");
    expect(workItemHydration.hydrateWorkItems).toHaveBeenCalledWith([101, 102, 103]);
    expect(result.workItemIds).toEqual([101, 102, 103]);
    expect(result.workItems.map((item) => item.id)).toEqual([101, 102, 103]);
    expect(result.relations).toHaveLength(1);
  });

  it("drops ids that the hydration port did not return", async () => {
    const savedQuery: SavedQueryPort = {
      listSavedQueries: vi.fn(),
      executeQuery: vi.fn(async () => ({ workItemIds: [1, 2, 3], relations: [] }))
    };
    const workItemHydration: WorkItemHydrationPort = {
      hydrateWorkItems: vi.fn(async () =>
        new Map<number, WorkItem>([
          [1, buildItem(1)],
          [3, buildItem(3)]
        ])
      )
    };

    const result = await runSavedQuery({ queryId: "abc" }, { savedQuery, workItemHydration });

    expect(result.workItems.map((item) => item.id)).toEqual([1, 3]);
    expect(result.workItemIds).toEqual([1, 2, 3]);
  });

  it("skips hydration when the query returns no ids", async () => {
    const hydrate = vi.fn(async () => new Map<number, WorkItem>());
    const savedQuery: SavedQueryPort = {
      listSavedQueries: vi.fn(),
      executeQuery: vi.fn(async () => ({ workItemIds: [], relations: [] }))
    };
    const workItemHydration: WorkItemHydrationPort = { hydrateWorkItems: hydrate };

    const result = await runSavedQuery({ queryId: "abc" }, { savedQuery, workItemHydration });

    expect(hydrate).not.toHaveBeenCalled();
    expect(result.workItems).toEqual([]);
  });

  it("rejects empty / whitespace-only query ids", async () => {
    const savedQuery: SavedQueryPort = {
      listSavedQueries: vi.fn(),
      executeQuery: vi.fn()
    };
    const workItemHydration: WorkItemHydrationPort = { hydrateWorkItems: vi.fn() };

    await expect(runSavedQuery({ queryId: "   " }, { savedQuery, workItemHydration })).rejects.toThrow(
      /queryId must not be empty/
    );
    expect(savedQuery.executeQuery).not.toHaveBeenCalled();
  });
});
