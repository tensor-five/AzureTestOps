import type { ClientPorts } from "../../application/ports/client/client-ports.js";
import { HttpAdoContextAdapter } from "../../adapters/http/http-ado-context.adapter.js";
import { HttpAuthPreflightAdapter } from "../../adapters/http/http-auth-preflight.adapter.js";
import { HttpRelationMutationsAdapter } from "../../adapters/http/http-relation-mutations.adapter.js";
import { HttpSavedQueryAdapter } from "../../adapters/http/http-saved-query.adapter.js";
import { HttpSetManagementAdapter } from "../../adapters/http/http-set-management.adapter.js";
import { HttpTestCatalogAdapter } from "../../adapters/http/http-test-catalog.adapter.js";
import { SseActiveSetSnapshotAdapter } from "../../adapters/http/sse-active-set-snapshot.adapter.js";

/**
 * Composition root for the browser-side hexagon.
 *
 * Instantiates the HTTP / SSE adapters that implement each client port and
 * returns a single {@link ClientPorts} bundle the React tree consumes via
 * the `<ClientPortsProvider>`. Tests build their own bundle (typed
 * mocks per port) and never go through this factory.
 */
export function buildBrowserClientPorts(): ClientPorts {
  return {
    activeSetSnapshot: new SseActiveSetSnapshotAdapter(),
    adoContext: new HttpAdoContextAdapter(),
    authPreflight: new HttpAuthPreflightAdapter(),
    relationMutations: new HttpRelationMutationsAdapter(),
    savedQuery: new HttpSavedQueryAdapter(),
    setManagement: new HttpSetManagementAdapter(),
    testCatalog: new HttpTestCatalogAdapter()
  };
}
