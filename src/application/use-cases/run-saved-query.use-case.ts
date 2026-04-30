import type { QueryExecutionResult } from "../../domain/work-items/saved-query.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { SavedQueryPort } from "../ports/saved-query.port.js";
import type { WorkItemHydrationPort } from "../ports/work-item-hydration.port.js";

export type RunSavedQueryInput = {
  queryId: string;
};

export type RunSavedQueryResult = {
  workItems: WorkItem[];
  /** Order preserved from the query result; missing hydrations are skipped. */
  workItemIds: number[];
  relations: ReadonlyArray<unknown>;
};

export type RunSavedQueryDeps = {
  savedQuery: SavedQueryPort;
  workItemHydration: WorkItemHydrationPort;
};

/**
 * Executes a Saved Query by id and hydrates the returned work-item ids into
 * full domain {@link WorkItem}s (carrying their `System.LinkTypes.Related`
 * targets in `relatedIds`).
 *
 * Hydration uses the existing chunked port; ids that fail to hydrate are
 * silently dropped so a partial backend failure cannot tank the whole view.
 */
export async function runSavedQuery(
  input: RunSavedQueryInput,
  deps: RunSavedQueryDeps
): Promise<RunSavedQueryResult> {
  const queryId = input.queryId.trim();
  if (queryId.length === 0) {
    throw new Error("RunSavedQuery: queryId must not be empty");
  }

  const execution: QueryExecutionResult = await deps.savedQuery.executeQuery(queryId);
  const ids = execution.workItemIds;
  if (ids.length === 0) {
    return { workItems: [], workItemIds: [], relations: execution.relations };
  }

  const hydrated = await deps.workItemHydration.hydrateWorkItems(ids);
  const workItems: WorkItem[] = [];
  for (const id of ids) {
    const item = hydrated.get(id);
    if (item) {
      workItems.push(item);
    }
  }

  return {
    workItems,
    workItemIds: ids,
    relations: execution.relations
  };
}
