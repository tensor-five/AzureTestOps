import type { RelatedLink } from "../../domain/relations/related-link.js";
import type { RelationPort } from "../ports/relation.port.js";
import { assertValidLink } from "./create-relation.use-case.js";

export type DeleteRelationInput = RelatedLink;

export type DeleteRelationDeps = {
  relations: RelationPort;
};

/**
 * Deletes a `System.LinkTypes.Related` link between two work items.
 *
 * The adapter treats a missing relation on remove as a no-op so the use
 * case is fully idempotent — repeated deletes after rapid clicks do not
 * surface spurious errors.
 */
export async function deleteRelation(
  input: DeleteRelationInput,
  deps: DeleteRelationDeps
): Promise<void> {
  assertValidLink("DeleteRelation", input);
  await deps.relations.removeRelation({
    sourceWorkItemId: input.sourceWorkItemId,
    targetWorkItemId: input.targetWorkItemId
  });
}
