/**
 * Wire-shape for the `System.LinkTypes.Related` mutation endpoint. The
 * domain-side {@link import("../../domain/relations/related-link.js").RelatedLink}
 * carries the same pair under a richer name; this DTO is what crosses the
 * client/server boundary unchanged.
 */
export type RelationLinkRequest = {
  sourceId: number;
  targetId: number;
};
