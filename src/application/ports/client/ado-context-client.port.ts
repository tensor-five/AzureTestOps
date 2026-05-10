import type { AdoContext } from "../ado-context.port.js";
import type { AdoCliDefaults } from "../../dto/ado-cli-defaults.dto.js";

/**
 * Browser-facing read/write port for the locally persisted ADO context. The
 * server stores it through the lowdb-backed user-preferences adapter and
 * surfaces only the minimal getter/setter pair plus the CLI defaults probe
 * used by the first-run setup form.
 */
export interface AdoContextClientPort {
  getContext(): Promise<AdoContext | null>;
  setContext(context: AdoContext): Promise<AdoContext>;
  getCliDefaults(): Promise<AdoCliDefaults>;
}
