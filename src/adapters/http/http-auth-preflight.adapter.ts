import type {
  AuthPreflightResult,
  AuthPreflightStatus
} from "../../application/ports/auth-preflight.port.js";
import type { AuthPreflightClientPort } from "../../application/ports/client/auth-preflight-client.port.js";

/**
 * HTTP adapter implementing {@link AuthPreflightClientPort} against the
 * local server's `/phase2/auth-preflight` endpoint.
 *
 * Talks to the server with a hand-rolled `fetch` (instead of {@link
 * jsonFetch}) so non-OK responses degrade to `UNKNOWN_ERROR` rather than
 * throwing — the badge always wants a status, even on transport failures.
 */
export class HttpAuthPreflightAdapter implements AuthPreflightClientPort {
  public async check(): Promise<AuthPreflightStatus> {
    if (typeof fetch === "undefined") {
      return "UNKNOWN_ERROR";
    }
    try {
      const response = await fetch("/phase2/auth-preflight", {
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        return "UNKNOWN_ERROR";
      }
      const payload = (await response.json()) as { result?: AuthPreflightResult };
      return payload.result?.status ?? "UNKNOWN_ERROR";
    } catch {
      return "UNKNOWN_ERROR";
    }
  }
}
