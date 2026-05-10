import type { Set } from "../../domain/sets/set.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

export type ListSetsResult = {
  sets: Set[];
  activeSetId: string | null;
};

export type ListSetsDeps = {
  setRepository: SetRepositoryPort;
};

/**
 * Returns every persisted Set plus the currently-active set id (or `null` when
 * none is selected / the active pointer is stale).
 */
export async function listSets(deps: ListSetsDeps): Promise<ListSetsResult> {
  const [sets, activeSetId] = await Promise.all([
    deps.setRepository.listSets(),
    deps.setRepository.getActiveId()
  ]);
  return { sets, activeSetId };
}
