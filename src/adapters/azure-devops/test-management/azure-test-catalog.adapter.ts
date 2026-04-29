import { requestWithRetry } from "../../../shared/utils/retry.js";
import {
  buildAdoBaseUrl,
  type AdoOrgProjectContext,
  type AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";
import type { TestCatalogPort } from "../../../application/ports/test-catalog.port.js";
import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../../domain/test-management/test-plan.js";

const API_VERSION_50 = "5.0";
const PLANS_PAGE_SIZE = 200;

export type AzureTestCatalogAdapterOptions = {
  /** Page size for the Plans list. Defaults to 200 (Azure caps at 1000). */
  plansPageSize?: number;
};

/**
 * Lists Test Plans + their Suites for the Set-creation UI. Talks to the
 * stable `5.0` Test endpoints (the same baseline as
 * {@link AzureTestManagementAdapter#loadSuiteTree}); newer API versions
 * change the suite shape and break callers that expect `parentSuite.id`.
 */
export class AzureTestCatalogAdapter implements TestCatalogPort {
  private readonly baseUrl: string;
  private readonly plansPageSize: number;

  public constructor(
    private readonly httpClient: AzureRestHttpClient,
    context: AdoOrgProjectContext,
    options: AzureTestCatalogAdapterOptions = {}
  ) {
    this.baseUrl = buildAdoBaseUrl(context);
    this.plansPageSize = options.plansPageSize ?? PLANS_PAGE_SIZE;
  }

  public async listTestPlans(): Promise<TestPlanSummary[]> {
    const all: TestPlanSummary[] = [];
    let continuationToken: string | undefined;

    do {
      const url = this.buildPlansUrl(continuationToken);
      const { response } = await requestWithRetry(() => this.httpClient.get(url));
      if (response.status !== 200) {
        throw new Error(`PLANS_HTTP_${response.status}`);
      }

      const value = readArray((response.json as { value?: unknown }).value);
      for (const raw of value) {
        const plan = toPlanSummary(raw);
        if (plan) {
          all.push(plan);
        }
      }

      continuationToken = readContinuationToken(response.headers);
    } while (continuationToken);

    return all;
  }

  public async listSuitesForPlan(planId: number): Promise<TestSuiteSummary[]> {
    const url = `${this.baseUrl}/_apis/test/Plans/${planId}/suites?api-version=${API_VERSION_50}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`SUITES_HTTP_${response.status}`);
    }

    const value = readArray((response.json as { value?: unknown }).value);
    const out: TestSuiteSummary[] = [];
    for (const raw of value) {
      const suite = toSuiteSummary(raw);
      if (suite) {
        out.push(suite);
      }
    }
    return out;
  }

  private buildPlansUrl(continuationToken: string | undefined): string {
    const base = `${this.baseUrl}/_apis/test/plans?$top=${this.plansPageSize}&api-version=${API_VERSION_50}`;
    if (!continuationToken) {
      return base;
    }
    return `${base}&continuationToken=${encodeURIComponent(continuationToken)}`;
  }
}

function toPlanSummary(value: unknown): TestPlanSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = readNumber(candidate.id);
  if (id === null) {
    return null;
  }
  const name = typeof candidate.name === "string" ? candidate.name : `Plan ${id}`;
  const areaPath = typeof candidate.areaPath === "string" ? candidate.areaPath : null;
  const iterationPath = typeof candidate.iteration === "string" ? candidate.iteration : null;
  return { id, name, areaPath, iterationPath };
}

function toSuiteSummary(value: unknown): TestSuiteSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = readNumber(candidate.id);
  if (id === null) {
    return null;
  }
  const name = typeof candidate.name === "string" ? candidate.name : `Suite ${id}`;
  const parentSuite = candidate.parentSuite as { id?: unknown } | undefined;
  const parentSuiteId = readNumber(parentSuite?.id);
  const suiteType = typeof candidate.suiteType === "string" ? candidate.suiteType : null;
  return { id, name, parentSuiteId, suiteType };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readContinuationToken(headers: Record<string, string | undefined> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }
  const value = headers["x-ms-continuationtoken"] ?? headers["X-MS-ContinuationToken"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
