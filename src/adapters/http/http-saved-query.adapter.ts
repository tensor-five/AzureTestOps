import type { SavedQuery } from "../../domain/work-items/saved-query.js";
import type { SavedQueryClientPort } from "../../application/ports/client/saved-query-client.port.js";
import { jsonFetch } from "./json-fetch.js";

/**
 * HTTP adapter implementing {@link SavedQueryClientPort} against the local
 * server's `/phase2/saved-queries` endpoint.
 */
export class HttpSavedQueryAdapter implements SavedQueryClientPort {
  public async list(): Promise<SavedQuery[]> {
    const payload = await jsonFetch<{ queries: SavedQuery[] }>("/phase2/saved-queries", {
      method: "GET"
    });
    return payload.queries;
  }
}
