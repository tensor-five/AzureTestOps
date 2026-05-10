import type { Set } from "../../domain/sets/set.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

/**
 * Cross-context read model emitted by the `LoadActiveSetSnapshot` use case.
 *
 * Lives in the application layer because it joins data from three bounded
 * contexts (Sets, Test Management, Work Items) — keeping it here means no
 * single domain has to depend on its peers.
 *
 * `relations` are not stored separately — every {@link WorkItem} carries its
 * `relatedIds` (`System.LinkTypes.Related` target work-item ids) directly.
 */
export type ActiveSetSnapshot = {
  set: Set;
  suiteTree: TestSuiteNode;
  projections: TestCaseProjection[];
  workItemsFromQuery: WorkItem[];
  /** ISO-8601 UTC timestamp; written by the use case at successful return time. */
  loadedAt: string;
};
