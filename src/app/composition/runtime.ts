import os from "node:os";
import path from "node:path";

import { AzureCliPreflightAdapter } from "../../adapters/azure-devops/auth/azure-cli-preflight.adapter.js";
import { AzureSavedQueryAdapter } from "../../adapters/azure-devops/queries/azure-saved-query.adapter.js";
import { AzureTestCatalogAdapter } from "../../adapters/azure-devops/test-management/azure-test-catalog.adapter.js";
import { AzureTestManagementAdapter } from "../../adapters/azure-devops/test-management/azure-test-management.adapter.js";
import { WorkItemBackedTestCaseHydrationAdapter } from "../../adapters/azure-devops/test-management/work-item-backed-test-case-hydration.adapter.js";
import { AzureRelationAdapter } from "../../adapters/azure-devops/work-items/azure-relation.adapter.js";
import { AzureWorkItemHydrationAdapter } from "../../adapters/azure-devops/work-items/azure-work-item-hydration.adapter.js";
import { LowdbAdoContextAdapter } from "../../adapters/persistence/settings/lowdb-ado-context.adapter.js";
import { LowdbUserPreferencesAdapter } from "../../adapters/persistence/settings/lowdb-user-preferences.adapter.js";
import { LowdbSetRepository } from "../../adapters/persistence/settings/set-repository.adapter.js";
import type { AdoContextPort } from "../../application/ports/ado-context.port.js";
import type { AuthPreflightPort } from "../../application/ports/auth-preflight.port.js";
import type { RelationPort } from "../../application/ports/relation.port.js";
import type { SavedQueryPort } from "../../application/ports/saved-query.port.js";
import type { SetRepositoryPort } from "../../application/ports/set-repository.port.js";
import type { TestCaseHydrationPort } from "../../application/ports/test-case-hydration.port.js";
import type { TestCatalogPort } from "../../application/ports/test-catalog.port.js";
import type { TestManagementReadPort } from "../../application/ports/test-management.port.js";
import type { UserPreferencesPort } from "../../application/ports/user-preferences.port.js";
import type { WorkItemHydrationPort } from "../../application/ports/work-item-hydration.port.js";
import { AzureCliTokenProvider } from "../../shared/azure-devops/azure-cli-token-provider.js";
import { FetchAzureRestClient } from "../../shared/azure-devops/fetch-azure-rest-client.js";
import type { AzureRestHttpClient } from "../../shared/azure-devops/azure-rest-client.js";

export type AdoRuntime = {
  /**
   * The active organization/project the rest of the runtime should use.
   * Resolved lazily on each call so a context change at runtime takes effect
   * without restarting the server.
   */
  resolveContext(): Promise<{ organization: string; project: string }>;
  testManagement(): Promise<TestManagementReadPort>;
  testCatalog(): Promise<TestCatalogPort>;
  workItemHydration(): Promise<WorkItemHydrationPort>;
  testCaseHydration(): Promise<TestCaseHydrationPort>;
  savedQuery(): Promise<SavedQueryPort>;
  relations(): Promise<RelationPort>;
};

export type RuntimeOptions = {
  /** Override `~/.azure-testops/user-preferences.json`. */
  userPreferencesFilePath?: string;
  /** Local user identity used to scope lowdb preferences. */
  localUserId?: string;
  /** Inject a stub HTTP client for tests. */
  httpClient?: AzureRestHttpClient;
};

export type Runtime = {
  preflight: AuthPreflightPort;
  userPreferences: UserPreferencesPort;
  setRepository: SetRepositoryPort;
  adoContext: AdoContextPort;
  ado: AdoRuntime;
};

const ADO_DIR_NAME = ".azure-testops";

/**
 * Composition root for the local server. Wires lowdb persistence, the auth
 * preflight adapter, and a memoizing factory of Azure adapters scoped to the
 * currently configured ADO context.
 *
 * Adapter creation is lazy and cached per (organization, project) tuple so
 * configuring or switching a tenant does not leak per-call connections.
 */
export function buildRuntime(options: RuntimeOptions = {}): Runtime {
  const userPreferencesFilePath =
    options.userPreferencesFilePath ?? path.join(os.homedir(), ADO_DIR_NAME, "user-preferences.json");
  const localUserId = options.localUserId ?? "local-user";

  const userPreferences = new LowdbUserPreferencesAdapter(userPreferencesFilePath, localUserId);
  const setRepository = new LowdbSetRepository({ preferences: userPreferences });
  const adoContext = new LowdbAdoContextAdapter(userPreferences);
  const preflight = new AzureCliPreflightAdapter();

  const httpClient = options.httpClient ?? buildDefaultHttpClient();

  let cached: { key: string; bundle: ResolvedAdoBundle } | null = null;

  const resolveContext = async (): Promise<{ organization: string; project: string }> => {
    const context = await adoContext.getContext();
    if (!context) {
      throw new AdoContextNotConfiguredError();
    }
    return context;
  };

  const resolveBundle = async (): Promise<ResolvedAdoBundle> => {
    const context = await resolveContext();
    const key = `${context.organization}::${context.project}`;
    if (cached && cached.key === key) {
      return cached.bundle;
    }
    const workItemHydration = new AzureWorkItemHydrationAdapter(httpClient, context);
    const bundle: ResolvedAdoBundle = {
      testManagement: new AzureTestManagementAdapter(httpClient, context),
      testCatalog: new AzureTestCatalogAdapter(httpClient, context),
      workItemHydration,
      testCaseHydration: new WorkItemBackedTestCaseHydrationAdapter(workItemHydration),
      savedQuery: new AzureSavedQueryAdapter(httpClient, context),
      relations: new AzureRelationAdapter(httpClient, context)
    };
    cached = { key, bundle };
    return bundle;
  };

  const ado: AdoRuntime = {
    resolveContext,
    testManagement: async () => (await resolveBundle()).testManagement,
    testCatalog: async () => (await resolveBundle()).testCatalog,
    workItemHydration: async () => (await resolveBundle()).workItemHydration,
    testCaseHydration: async () => (await resolveBundle()).testCaseHydration,
    savedQuery: async () => (await resolveBundle()).savedQuery,
    relations: async () => (await resolveBundle()).relations
  };

  return {
    preflight,
    userPreferences,
    setRepository,
    adoContext,
    ado
  };
}

type ResolvedAdoBundle = {
  testManagement: TestManagementReadPort;
  testCatalog: TestCatalogPort;
  workItemHydration: WorkItemHydrationPort;
  testCaseHydration: TestCaseHydrationPort;
  savedQuery: SavedQueryPort;
  relations: RelationPort;
};

function buildDefaultHttpClient(): AzureRestHttpClient {
  const tokenProvider = new AzureCliTokenProvider();
  return new FetchAzureRestClient({
    bearer: () => tokenProvider.getAccessToken().then(({ accessToken }) => ({ accessToken })),
    pat: () => process.env.ADO_PAT ?? process.env.AZURE_DEVOPS_EXT_PAT ?? null
  });
}

export class AdoContextNotConfiguredError extends Error {
  public readonly code = "ADO_CONTEXT_NOT_CONFIGURED";
  public constructor() {
    super("Azure DevOps context (organization / project) is not configured.");
    this.name = "AdoContextNotConfiguredError";
  }
}
