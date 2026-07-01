import type { AdoContext } from "../ado-context.port.js";

/**
 * Browser-facing port for resolving a Test Plan / Suite pair into the Azure
 * DevOps Test Results page. The caller owns the current ADO context snapshot;
 * this port only hides the concrete URL shape.
 */
export interface TestSuiteDeepLinkClientPort {
  buildHref(context: AdoContext, planId: string | number, suiteId: string | number): string;
}
