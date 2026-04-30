import type { AdoContext } from "../ado-context.port.js";

/**
 * Browser-facing port for resolving an Azure DevOps work item id into a
 * deep link the UI can navigate to (new tab / window).
 *
 * Stateless on purpose: the caller already owns the `AdoContext` snapshot
 * (through `useAdoContext()`), so the port just hides the concrete
 * `https://dev.azure.com/...` URL shape. Features stay vendor-agnostic; the
 * Azure-specific details live in the adapter implementation.
 */
export interface WorkItemDeepLinkClientPort {
  buildHref(context: AdoContext, workItemId: number): string;
}
