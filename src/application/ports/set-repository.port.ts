import type { Set, SetDraft } from "../../domain/sets/set.js";

/**
 * Persistence boundary for {@link Set}s plus the per-user "active set" pointer.
 *
 * Adapters must guarantee:
 *   - `listSets()` returns sets in stable order (insertion / id-sorted ok).
 *   - `create()` rejects an id that already exists.
 *   - `update()` rejects an id that doesn't exist.
 *   - `delete()` cascades to layout / filter state owned by the same user.
 *   - `getActiveId()` returns `null` when no set is active or the active
 *     pointer references a deleted set (auto-healed).
 */
export interface SetRepositoryPort {
  listSets(): Promise<Set[]>;
  getById(setId: string): Promise<Set | null>;
  create(draft: SetDraft, options?: { id?: string }): Promise<Set>;
  update(setId: string, patch: Partial<SetDraft>): Promise<Set>;
  delete(setId: string): Promise<void>;

  getActiveId(): Promise<string | null>;
  setActiveId(setId: string | null): Promise<void>;
}
