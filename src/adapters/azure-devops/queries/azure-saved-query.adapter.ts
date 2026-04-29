import { requestWithRetry } from "../../../shared/utils/retry.js";
import {
  buildAdoBaseUrl,
  type AdoOrgProjectContext,
  type AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";
import type { SavedQueryPort } from "../../../application/ports/saved-query.port.js";
import type {
  QueryExecutionResult,
  SavedQuery
} from "../../../domain/queries/saved-query.js";

const API_VERSION_71 = "7.1";
const SHARED_QUERIES_PATH = "Shared%20Queries";

/**
 * Azure DevOps adapter for the Saved Query catalog and stored-query
 * execution.
 *
 *  - `listSavedQueries` traverses the `Shared Queries` folder tree (single
 *    GET with `$depth=2`; deeper structures are dropped at the boundary
 *    until a real plan needs more) and emits leaf queries only.
 *  - `executeQuery` runs a stored query by id via
 *    `GET /_apis/wit/wiql/{id}` (the documented endpoint — `POST` exists
 *    but is reserved for ad-hoc WIQL bodies).
 */
export class AzureSavedQueryAdapter implements SavedQueryPort {
  private readonly baseUrl: string;

  public constructor(
    private readonly httpClient: AzureRestHttpClient,
    context: AdoOrgProjectContext
  ) {
    this.baseUrl = buildAdoBaseUrl(context);
  }

  public async listSavedQueries(): Promise<SavedQuery[]> {
    const url =
      `${this.baseUrl}/_apis/wit/queries/${SHARED_QUERIES_PATH}` +
      `?$depth=2&$expand=all&api-version=${API_VERSION_71}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`SAVED_QUERY_LIST_HTTP_${response.status}`);
    }
    const leaves: SavedQuery[] = [];
    collectLeafQueries(response.json, leaves);
    return leaves;
  }

  public async executeQuery(queryId: string): Promise<QueryExecutionResult> {
    const trimmed = queryId.trim();
    if (trimmed.length === 0) {
      throw new Error("SAVED_QUERY_EXECUTE_INVALID_ID");
    }
    const url =
      `${this.baseUrl}/_apis/wit/wiql/${encodeURIComponent(trimmed)}` +
      `?api-version=${API_VERSION_71}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`SAVED_QUERY_EXECUTE_HTTP_${response.status}`);
    }
    return parseExecutionResult(response.json);
  }
}

function collectLeafQueries(node: unknown, out: SavedQuery[]): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const candidate = node as Record<string, unknown>;
  const children = Array.isArray(candidate.children) ? candidate.children : [];
  if (candidate.isFolder === true) {
    for (const child of children) {
      collectLeafQueries(child, out);
    }
    return;
  }
  // Some endpoints return a flat envelope `{ value: [...] }` for the root.
  if (Array.isArray(candidate.value)) {
    for (const child of candidate.value) {
      collectLeafQueries(child, out);
    }
    return;
  }
  const id = typeof candidate.id === "string" ? candidate.id : null;
  const name = typeof candidate.name === "string" ? candidate.name : null;
  const path = typeof candidate.path === "string" ? candidate.path : name;
  if (id && name && path) {
    out.push({ id, name, path, isFolder: false });
  }
}

function parseExecutionResult(payload: unknown): QueryExecutionResult {
  if (!payload || typeof payload !== "object") {
    return { workItemIds: [], relations: [] };
  }
  const candidate = payload as Record<string, unknown>;
  const workItems = Array.isArray(candidate.workItems) ? candidate.workItems : [];
  const ids: number[] = [];
  for (const entry of workItems) {
    if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "number") {
      const id = (entry as { id: number }).id;
      if (Number.isFinite(id)) {
        ids.push(id);
      }
    }
  }
  const relations = Array.isArray(candidate.workItemRelations)
    ? (candidate.workItemRelations as unknown[])
    : [];
  return { workItemIds: ids, relations };
}
