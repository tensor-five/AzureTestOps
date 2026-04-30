import type { AdoContext } from "../ado-context.port.js";
import type { AdoCliDefaults } from "../../dto/ado-cli-defaults.dto.js";

/**
 * Browser-facing read/write port for the local ADO context
 * (`~/.azure-testops/ado-context.json`). The server already enforces a
 * single-tenant invariant, so the port intentionally surfaces only the
 * minimal getter/setter pair plus the CLI defaults probe used by the
 * first-run setup form.
 */
export interface AdoContextClientPort {
  getContext(): Promise<AdoContext | null>;
  setContext(context: AdoContext): Promise<AdoContext>;
  getCliDefaults(): Promise<AdoCliDefaults>;
}
