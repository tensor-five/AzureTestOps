import type {
  QueryExecutionResult,
  SavedQuery
} from "../../domain/queries/saved-query.js";

/**
 * Boundary contract for read access to Azure DevOps Saved Queries.
 *
 * The adapter is responsible for talking to `/_apis/wit/queries` (catalog)
 * and `/_apis/wit/wiql/{id}` (execution); the application layer stays
 * Azure-agnostic and merely orchestrates listing + execution + hydration.
 */
export interface SavedQueryPort {
  /**
   * Returns the flattened list of leaf queries under `Shared Queries`.
   * Folders are not surfaced — callers expect addressable, executable
   * queries only.
   */
  listSavedQueries(): Promise<SavedQuery[]>;

  /**
   * Executes a stored query by id. The result is normalized into a list of
   * work-item ids (in API order) plus the raw `relations` array (opaque to
   * the application layer; only tree queries populate it).
   */
  executeQuery(queryId: string): Promise<QueryExecutionResult>;
}
