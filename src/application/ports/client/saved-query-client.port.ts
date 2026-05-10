import type { SavedQuery } from "../../../domain/work-items/saved-query.js";

/**
 * Browser-facing read port for the Saved Query catalog (used by the Set
 * creation/edit dialog when the user picks the right-column query).
 */
export interface SavedQueryClientPort {
  list(): Promise<SavedQuery[]>;
}
