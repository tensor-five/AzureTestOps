import type { RelationLinkRequest } from "../../application/dto/relation-link.dto.js";
import type { RelationMutationsClientPort } from "../../application/ports/client/relation-mutations-client.port.js";
import { jsonFetch } from "./json-fetch.js";

/**
 * HTTP adapter implementing {@link RelationMutationsClientPort} against the
 * local server's `/phase2/relations` endpoint.
 *
 * The server applies optimistic concurrency on the Azure DevOps PATCH
 * (`op:test /rev` + retry) — the browser only forwards the link pair and
 * surfaces failures via {@link ApiError}.
 */
export class HttpRelationMutationsAdapter implements RelationMutationsClientPort {
  public async add(link: RelationLinkRequest): Promise<void> {
    await jsonFetch<{ status: string }>("/phase2/relations", {
      method: "POST",
      body: link
    });
  }

  public async remove(link: RelationLinkRequest): Promise<void> {
    await jsonFetch<{ status: string }>("/phase2/relations", {
      method: "DELETE",
      body: link
    });
  }
}
