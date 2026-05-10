import type { RelationLinkRequest } from "../../dto/relation-link.dto.js";

/**
 * Browser-facing port for `System.LinkTypes.Related` mutations.
 *
 * The server-side {@link import("../relation.port.js").RelationPort} accepts
 * a domain {@link import("../../../domain/relations/related-link.js").RelatedLink};
 * the client port stays at the wire shape because the optimistic-update hook
 * in the UI never materializes the full domain object.
 */
export interface RelationMutationsClientPort {
  add(link: RelationLinkRequest): Promise<void>;
  remove(link: RelationLinkRequest): Promise<void>;
}
