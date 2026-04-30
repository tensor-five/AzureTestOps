/**
 * Minimal HTTP client surface that the Azure DevOps adapters require.
 *
 * The local backend (`local-server.ts`) provides the concrete implementation
 * and injects the auth header. Adapters stay transport-agnostic and focused
 * on URL building and response normalization.
 */
export type AzureHttpResponse = {
  status: number;
  json: unknown;
  headers?: Record<string, string | undefined>;
};

export interface AzureRestHttpClient {
  get(url: string): Promise<AzureHttpResponse>;
  patch?(
    url: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<AzureHttpResponse>;
}

export type AdoOrgProjectContext = {
  organization: string;
  project: string;
};

/**
 * Builds the canonical `https://dev.azure.com/{org}/{project}` prefix.
 * Tolerates fully-qualified organization URLs by stripping the host before
 * re-applying it.
 */
export function buildAdoBaseUrl(context: AdoOrgProjectContext): string {
  const organization = context.organization
    .trim()
    .replace(/^https?:\/\/dev\.azure\.com\//i, "")
    .replace(/\/$/, "");
  const project = encodeURIComponent(context.project.trim());
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${project}`;
}

/**
 * Builds the deep link to a work item's edit view in the Azure DevOps web UI.
 * Used by the relations view to open IDs in a new tab.
 */
export function buildWorkItemUrl(context: AdoOrgProjectContext, workItemId: number): string {
  return `${buildAdoBaseUrl(context)}/_workitems/edit/${workItemId}`;
}
