import type { Set, SetDraft } from "../../domain/sets/set.js";
import type {
  CreateSetRequest,
  ListSetsResponse
} from "../../application/dto/set-management.dto.js";
import type { SetManagementClientPort } from "../../application/ports/client/set-management-client.port.js";
import { jsonFetch } from "./json-fetch.js";

/**
 * HTTP adapter implementing {@link SetManagementClientPort} against the
 * local server's `/phase2/sets` and `/phase2/active-set` endpoints.
 */
export class HttpSetManagementAdapter implements SetManagementClientPort {
  public list(): Promise<ListSetsResponse> {
    return jsonFetch<ListSetsResponse>("/phase2/sets", { method: "GET" });
  }

  public async create(draft: CreateSetRequest): Promise<Set> {
    const payload = await jsonFetch<{ set: Set }>("/phase2/sets", {
      method: "POST",
      body: draft
    });
    return payload.set;
  }

  public async update(setId: string, patch: Partial<SetDraft>): Promise<Set> {
    const payload = await jsonFetch<{ set: Set }>(`/phase2/sets/${encodeURIComponent(setId)}`, {
      method: "PATCH",
      body: patch
    });
    return payload.set;
  }

  public async delete(setId: string): Promise<void> {
    await jsonFetch<{ status: string }>(`/phase2/sets/${encodeURIComponent(setId)}`, {
      method: "DELETE"
    });
  }

  public async setActive(setId: string | null): Promise<void> {
    await jsonFetch<{ activeSetId: string | null }>("/phase2/active-set", {
      method: "POST",
      body: { setId }
    });
  }
}
