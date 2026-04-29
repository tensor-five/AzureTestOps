import type { RelatedLink } from "../../domain/relations/related-link.js";
import type { RelationPort } from "../ports/relation.port.js";

export type CreateRelationInput = RelatedLink;

export type CreateRelationDeps = {
  relations: RelationPort;
};

/**
 * Creates a `System.LinkTypes.Related` link between two work items.
 *
 * Validation lives in the use case so adapters can stay narrowly scoped to
 * transport concerns. The adapter is responsible for idempotency
 * (`RelationAlreadyExists` → success) and for retrying on rev-mismatch.
 */
export async function createRelation(
  input: CreateRelationInput,
  deps: CreateRelationDeps
): Promise<void> {
  assertValidLink("CreateRelation", input);
  await deps.relations.addRelation({
    sourceWorkItemId: input.sourceWorkItemId,
    targetWorkItemId: input.targetWorkItemId
  });
}

export function assertValidLink(useCaseName: string, link: RelatedLink): void {
  if (!Number.isFinite(link.sourceWorkItemId) || link.sourceWorkItemId <= 0) {
    throw new Error(`${useCaseName}: sourceWorkItemId must be a positive integer`);
  }
  if (!Number.isFinite(link.targetWorkItemId) || link.targetWorkItemId <= 0) {
    throw new Error(`${useCaseName}: targetWorkItemId must be a positive integer`);
  }
  if (link.sourceWorkItemId === link.targetWorkItemId) {
    throw new Error(`${useCaseName}: source and target must differ`);
  }
}
