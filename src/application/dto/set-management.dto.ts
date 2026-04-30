import type { Set, SetDraft } from "../../domain/sets/set.js";

/**
 * Combined response for the "list sets" client read — bundles the set list
 * with the active-set pointer so the UI can render the dropdown in one
 * round-trip.
 */
export type ListSetsResponse = {
  sets: Set[];
  activeSetId: string | null;
};

/**
 * Wire-shape for `POST /sets`: a {@link SetDraft} plus an optional flag that
 * also flips the active pointer once the create succeeds.
 */
export type CreateSetRequest = SetDraft & {
  setActive?: boolean;
};
