import type { Set, SetDraft } from "../../../domain/sets/set.js";
import type {
  CreateSetRequest,
  ListSetsResponse
} from "../../dto/set-management.dto.js";

/**
 * Browser-facing port for Set CRUD + active-set selection. Bundled into a
 * single port (rather than split per command) because every consumer hook
 * uses the full surface — splitting would only produce 1:1 wrappers.
 */
export interface SetManagementClientPort {
  list(): Promise<ListSetsResponse>;
  create(draft: CreateSetRequest): Promise<Set>;
  update(setId: string, patch: Partial<SetDraft>): Promise<Set>;
  delete(setId: string): Promise<void>;
  setActive(setId: string | null): Promise<void>;
}
