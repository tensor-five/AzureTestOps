import type { TestSuiteDeepLinkClientPort } from "../../../application/ports/client/test-suite-deep-link-client.port.js";
import type { AdoContext } from "../../../application/ports/ado-context.port.js";
import { buildAdoBaseUrl } from "../../../shared/azure-devops/azure-rest-client.js";

/**
 * Builds Azure DevOps Test Management result-page links for a Test Suite.
 */
export class AzureTestSuiteDeepLinkAdapter implements TestSuiteDeepLinkClientPort {
  public buildHref(context: AdoContext, planId: string | number, suiteId: string | number): string {
    const query = new URLSearchParams({
      view: "_TestManagement",
      planId: String(planId).trim(),
      suiteId: String(suiteId).trim()
    });
    return `${buildAdoBaseUrl(context)}/_testPlans/execute?${query.toString()}`;
  }
}
