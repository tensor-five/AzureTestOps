import type { ActiveSetSnapshotClientPort } from "./active-set-snapshot-client.port.js";
import type { AdoContextClientPort } from "./ado-context-client.port.js";
import type { AuthPreflightClientPort } from "./auth-preflight-client.port.js";
import type { RelationMutationsClientPort } from "./relation-mutations-client.port.js";
import type { SavedQueryClientPort } from "./saved-query-client.port.js";
import type { SetManagementClientPort } from "./set-management-client.port.js";
import type { TestCatalogClientPort } from "./test-catalog-client.port.js";

/**
 * Bundle of every browser-facing port the UI needs from the local server.
 * The composition root constructs concrete adapters and passes a single
 * {@link ClientPorts} object down to the React tree (and to feature hooks
 * via injectable deps), so individual hooks never reach for global imports.
 */
export type ClientPorts = {
  activeSetSnapshot: ActiveSetSnapshotClientPort;
  adoContext: AdoContextClientPort;
  authPreflight: AuthPreflightClientPort;
  relationMutations: RelationMutationsClientPort;
  savedQuery: SavedQueryClientPort;
  setManagement: SetManagementClientPort;
  testCatalog: TestCatalogClientPort;
};
