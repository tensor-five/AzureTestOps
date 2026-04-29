import type { TestCaseProjection } from "../test-management/test-case-projection.js";
import type { TestSuiteNode } from "../test-management/test-suite-tree.js";
import type { WorkItem } from "../work-items/work-item.js";

/**
 * A Set bundles "what to compare" into one switchable unit: a Test Plan
 * (with one root Test Suite, recursive) plus a Saved Query that drives the
 * right-hand work-item column.
 *
 * Identifiers are kept as strings end-to-end (lowdb / wire / DOM-friendly);
 * the `LoadActiveSetSnapshot` use case parses planId / rootSuiteId into
 * numbers at the boundary to the Azure adapters.
 */
export type Set = {
  id: string;
  name: string;
  planId: string;
  planName?: string;
  rootSuiteId: string;
  rootSuiteName?: string;
  queryId: string;
  queryName?: string;
  /** Optional ADO context override; defaults from `~/.azure-testops/ado-context.json`. */
  organization?: string;
  project?: string;
};

export type SetDraft = Omit<Set, "id">;

/**
 * Snapshot of the data backing the active Set at a point in time.
 *
 * `relations` are not stored separately — every {@link WorkItem} carries its
 * `relatedIds` (System.LinkTypes.Related target work-item ids) directly.
 */
export type ActiveSetSnapshot = {
  set: Set;
  suiteTree: TestSuiteNode;
  projections: TestCaseProjection[];
  workItemsFromQuery: WorkItem[];
  /** ISO-8601 UTC timestamp; written by the use case at successful return time. */
  loadedAt: string;
};
