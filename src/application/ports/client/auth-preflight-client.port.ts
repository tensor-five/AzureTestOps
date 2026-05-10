import type { AuthPreflightStatus } from "../auth-preflight.port.js";

/**
 * Browser-facing port for the auth-preflight check.
 *
 * Mirrors the server-side {@link import("../auth-preflight.port.js").AuthPreflightPort}
 * but without the context argument. The local server resolves the active
 * context from lowdb-backed user preferences, so the browser does not have to
 * pass it around.
 */
export interface AuthPreflightClientPort {
  check(): Promise<AuthPreflightStatus>;
}
