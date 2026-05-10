import type { SetRepositoryPort } from "../ports/set-repository.port.js";

export type DeleteSetInput = {
  setId: string;
};

export type DeleteSetDeps = {
  setRepository: SetRepositoryPort;
};

/**
 * Deletes a Set and the layout / filter state owned by it. The repository
 * adapter is responsible for the cascade (clearing the active pointer when
 * the deleted set was active and removing matching `setLayouts[id]` /
 * `setFilters[id]` entries).
 *
 * Idempotent: deleting an unknown id is a no-op.
 */
export async function deleteSet(input: DeleteSetInput, deps: DeleteSetDeps): Promise<void> {
  const setId = input.setId.trim();
  if (!setId) {
    throw new Error("DeleteSet: setId is required");
  }
  await deps.setRepository.delete(setId);
}
