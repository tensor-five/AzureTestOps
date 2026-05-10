/**
 * Directed relation between two Azure DevOps Work Items expressed via the
 * `System.LinkTypes.Related` link type. The domain treats the link as a
 * simple `(source, target)` pair — Azure DevOps stores the inverse half on
 * the target item automatically.
 */
export type RelatedLink = {
  sourceWorkItemId: number;
  targetWorkItemId: number;
};
