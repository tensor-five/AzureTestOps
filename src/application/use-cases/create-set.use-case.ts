import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

export type CreateSetInput = SetDraft & {
  /** Optional pre-assigned id (e.g. server-side allocation). */
  id?: string;
  /** Mark the new set as active immediately. Default: `false`. */
  setActive?: boolean;
};

export type CreateSetDeps = {
  setRepository: SetRepositoryPort;
};

/**
 * Validates a Set draft, persists it, and optionally promotes it to the active
 * Set. Validation enforces the three load-bearing identifiers — without
 * planId, rootSuiteId or queryId the snapshot loader cannot run.
 */
export async function createSet(input: CreateSetInput, deps: CreateSetDeps): Promise<Set> {
  const { id, setActive, ...draftRaw } = input;
  const draft: SetDraft = {
    name: requireNonEmpty(draftRaw.name, "name"),
    planId: requireNonEmpty(draftRaw.planId, "planId"),
    rootSuiteId: requireNonEmpty(draftRaw.rootSuiteId, "rootSuiteId"),
    queryId: requireNonEmpty(draftRaw.queryId, "queryId"),
    planName: trimOptional(draftRaw.planName),
    rootSuiteName: trimOptional(draftRaw.rootSuiteName),
    queryName: trimOptional(draftRaw.queryName),
    organization: trimOptional(draftRaw.organization),
    project: trimOptional(draftRaw.project)
  };

  const created = await deps.setRepository.create(draft, id ? { id } : undefined);

  if (setActive) {
    await deps.setRepository.setActiveId(created.id);
  }

  return created;
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`CreateSet: "${field}" is required`);
  }
  return value.trim();
}

function trimOptional(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
