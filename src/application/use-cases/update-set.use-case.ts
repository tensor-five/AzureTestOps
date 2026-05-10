import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

export type UpdateSetInput = {
  setId: string;
  patch: Partial<SetDraft>;
};

export type UpdateSetDeps = {
  setRepository: SetRepositoryPort;
};

/**
 * Patches an existing Set. The required identifiers (planId, rootSuiteId,
 * queryId) and the display name are validated when present, but they remain
 * optional in the patch — callers can rename a set without re-supplying its
 * identity.
 */
export async function updateSet(input: UpdateSetInput, deps: UpdateSetDeps): Promise<Set> {
  const setId = input.setId.trim();
  if (!setId) {
    throw new Error("UpdateSet: setId is required");
  }

  const patch: Partial<SetDraft> = {};
  applyValidatedString(patch, input.patch, "name");
  applyValidatedString(patch, input.patch, "planId");
  applyValidatedString(patch, input.patch, "rootSuiteId");
  applyValidatedString(patch, input.patch, "queryId");

  copyOptionalString(patch, input.patch, "planName");
  copyOptionalString(patch, input.patch, "rootSuiteName");
  copyOptionalString(patch, input.patch, "queryName");
  copyOptionalString(patch, input.patch, "organization");
  copyOptionalString(patch, input.patch, "project");

  return deps.setRepository.update(setId, patch);
}

function applyValidatedString<K extends "name" | "planId" | "rootSuiteId" | "queryId">(
  out: Partial<SetDraft>,
  source: Partial<SetDraft>,
  key: K
): void {
  if (!(key in source) || source[key] === undefined) {
    return;
  }
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`UpdateSet: "${key}" must be a non-empty string`);
  }
  out[key] = value.trim();
}

function copyOptionalString<
  K extends "planName" | "rootSuiteName" | "queryName" | "organization" | "project"
>(out: Partial<SetDraft>, source: Partial<SetDraft>, key: K): void {
  if (!(key in source)) {
    return;
  }
  const value = source[key];
  if (value === undefined) {
    out[key] = undefined;
    return;
  }
  if (typeof value !== "string") {
    throw new Error(`UpdateSet: "${key}" must be a string when provided`);
  }
  const trimmed = value.trim();
  out[key] = trimmed.length > 0 ? trimmed : undefined;
}
