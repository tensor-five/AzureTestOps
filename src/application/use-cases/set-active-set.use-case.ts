import type { SetRepositoryPort } from "../ports/set-repository.port.js";

export type SetActiveSetInput = {
  /** Set id to activate, or `null` to clear the active pointer. */
  setId: string | null;
};

export type SetActiveSetDeps = {
  setRepository: SetRepositoryPort;
};

/**
 * Activates a Set (or clears the active pointer). The repository validates
 * that the id exists.
 */
export async function setActiveSet(
  input: SetActiveSetInput,
  deps: SetActiveSetDeps
): Promise<void> {
  if (input.setId === null) {
    await deps.setRepository.setActiveId(null);
    return;
  }
  const id = input.setId.trim();
  if (!id) {
    throw new Error("SetActiveSet: setId must be a non-empty string or null");
  }
  await deps.setRepository.setActiveId(id);
}
