import type { AdoContext } from "../../../application/ports/ado-context.port.js";
import type { WorkItemDeepLinkClientPort } from "../../../application/ports/client/work-item-deep-link-client.port.js";
import { buildAdoBaseUrl } from "../../../shared/azure-devops/azure-rest-client.js";

/**
 * Builds Azure DevOps work-item deep links from the current ADO context.
 *
 * Encapsulates the `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`
 * URL shape so feature code can stay vendor-agnostic and request links via
 * `WorkItemDeepLinkClientPort` instead of constructing URLs directly.
 */
export class AzureWorkItemDeepLinkAdapter implements WorkItemDeepLinkClientPort {
  public buildHref(context: AdoContext, workItemId: number): string {
    return `${buildAdoBaseUrl(context)}/_workitems/edit/${workItemId}`;
  }
}
