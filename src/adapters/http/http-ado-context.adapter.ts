import type { AdoContext } from "../../application/ports/ado-context.port.js";
import type { AdoContextClientPort } from "../../application/ports/client/ado-context-client.port.js";
import type { AdoCliDefaults } from "../../application/dto/ado-cli-defaults.dto.js";
import { jsonFetch } from "./json-fetch.js";

/**
 * HTTP adapter implementing {@link AdoContextClientPort} against the local
 * server's `/phase2/ado-context` and `/phase2/az-cli-defaults` endpoints.
 */
export class HttpAdoContextAdapter implements AdoContextClientPort {
  public async getContext(): Promise<AdoContext | null> {
    const payload = await jsonFetch<{ context: AdoContext | null }>("/phase2/ado-context", {
      method: "GET"
    });
    return payload.context;
  }

  public async setContext(context: AdoContext): Promise<AdoContext> {
    const payload = await jsonFetch<{ context: AdoContext }>("/phase2/ado-context", {
      method: "POST",
      body: context
    });
    return payload.context;
  }

  public async getCliDefaults(): Promise<AdoCliDefaults> {
    const payload = await jsonFetch<{ defaults: AdoCliDefaults }>("/phase2/az-cli-defaults", {
      method: "GET"
    });
    return payload.defaults;
  }
}
