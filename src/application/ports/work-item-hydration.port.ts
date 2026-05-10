import type { WorkItem } from "../../domain/work-items/work-item.js";

/**
 * Boundary contract for hydrating Work Items by id. The Azure DevOps REST
 * API caps `?ids=...` at 200 per request, so adapters chunk the input
 * transparently.
 */
export interface WorkItemHydrationPort {
  /**
   * Returns hydrated work items keyed by id. Items the API did not return
   * are simply absent from the map — call sites must treat absence as a
   * partial failure rather than a hard error.
   */
  hydrateWorkItems(ids: number[]): Promise<Map<number, WorkItem>>;
}
