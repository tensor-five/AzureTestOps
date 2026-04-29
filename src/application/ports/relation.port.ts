import type { RelatedLink } from "../../domain/relations/related-link.js";

/**
 * Boundary contract for the write-side of `System.LinkTypes.Related` links.
 *
 * Implementations must:
 *  - apply optimistic concurrency via JSON-Patch `op:test /rev` and retry
 *    once on `409 RevisionMismatch`;
 *  - treat `400 RelationAlreadyExists` (add) as success — the desired
 *    end-state matches;
 *  - treat a missing relation on remove as a no-op.
 *
 * Reads of existing related ids happen via {@link WorkItemHydrationPort}, so
 * this port intentionally exposes commands only.
 */
export interface RelationPort {
  /** Adds a `System.LinkTypes.Related` link from source → target. */
  addRelation(link: RelatedLink): Promise<void>;

  /** Removes a `System.LinkTypes.Related` link from source → target. */
  removeRelation(link: RelatedLink): Promise<void>;
}
