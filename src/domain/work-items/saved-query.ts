/**
 * A "Saved Query" (Work Item Query Language entry stored under
 * `Shared Queries`). The domain stays transport-agnostic; adapters translate
 * the upstream REST shape into this value object.
 */
export type SavedQuery = {
  id: string;
  /** Display name of the leaf query (no folder path). */
  name: string;
  /** Folder-anchored path, e.g. `"Shared Queries/Bugs/Open Bugs"`. */
  path: string;
  /** Always `false` for entries surfaced through the application layer. */
  isFolder: false;
};

/**
 * Result of executing a stored query. `relations` is opaque on purpose:
 * tree queries return `workItemRelations`, flat queries do not. The
 * application layer hydrates `workItemIds` regardless.
 */
export type QueryExecutionResult = {
  workItemIds: number[];
  relations: ReadonlyArray<unknown>;
};
