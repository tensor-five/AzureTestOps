import { requestWithRetry } from "../../../shared/utils/retry.js";
import {
  buildAdoBaseUrl,
  type AdoOrgProjectContext,
  type AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";
import type { TestManagementReadPort } from "../../../application/ports/test-management.port.js";
import type { TestPoint } from "../../../domain/test-management/test-point.js";
import type { TestResult } from "../../../domain/test-management/test-result.js";
import type { TestRun } from "../../../domain/test-management/test-run.js";
import type { TestSuiteNode } from "../../../domain/test-management/test-suite-tree.js";

const API_VERSION_71 = "7.1";
const API_VERSION_50 = "5.0";
const RUNS_PAGE_SIZE = 1000;
const RESULTS_PAGE_SIZE = 100;
const POINTS_PAGE_SIZE = 200;

export type AzureTestManagementAdapterOptions = {
  /** Page size for runs (skip/top). Defaults to 1000. */
  runsPageSize?: number;
  /** Page size for results (skip/top). Defaults to 100 (capped by Azure when detailsToInclude=Point). */
  resultsPageSize?: number;
  /** Page size for points (continuation token). Defaults to 200. */
  pointsPageSize?: number;
};

export class AzureTestManagementAdapter implements TestManagementReadPort {
  private readonly baseUrl: string;
  private readonly runsPageSize: number;
  private readonly resultsPageSize: number;
  private readonly pointsPageSize: number;

  public constructor(
    private readonly httpClient: AzureRestHttpClient,
    context: AdoOrgProjectContext,
    options: AzureTestManagementAdapterOptions = {}
  ) {
    this.baseUrl = buildAdoBaseUrl(context);
    this.runsPageSize = options.runsPageSize ?? RUNS_PAGE_SIZE;
    this.resultsPageSize = options.resultsPageSize ?? RESULTS_PAGE_SIZE;
    this.pointsPageSize = options.pointsPageSize ?? POINTS_PAGE_SIZE;
  }

  public async loadSuiteTree(planId: number, rootSuiteId: number): Promise<TestSuiteNode> {
    const url = `${this.baseUrl}/_apis/test/Plans/${planId}/suites?$asTreeView=true&api-version=${API_VERSION_50}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`SUITE_TREE_HTTP_${response.status}`);
    }

    const value = readArray((response.json as { value?: unknown }).value);
    const allRoots = value.map(toSuiteNodeRaw).filter((node): node is RawSuiteNode => node !== null);

    const subtree = findRawSuiteById(allRoots, rootSuiteId);
    if (!subtree) {
      throw new Error(`SUITE_TREE_ROOT_NOT_FOUND_${rootSuiteId}`);
    }

    return projectSuite(subtree, null, []);
  }

  public async listTestCasesInSuite(planId: number, suiteId: number): Promise<number[]> {
    const url = `${this.baseUrl}/_apis/test/Plans/${planId}/suites/${suiteId}/testcases?api-version=${API_VERSION_50}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`TEST_CASES_HTTP_${response.status}`);
    }

    const value = readArray((response.json as { value?: unknown }).value);
    const ids: number[] = [];
    for (const entry of value) {
      const testCaseId = readNumber(((entry as { testCase?: { id?: unknown } }).testCase ?? {}).id);
      if (testCaseId !== null) {
        ids.push(testCaseId);
      }
    }
    return ids;
  }

  public async loadPointsForSuite(planId: number, suiteId: number): Promise<TestPoint[]> {
    const all: TestPoint[] = [];
    let continuationToken: string | undefined;

    do {
      const url = this.buildPointsUrl(planId, suiteId, continuationToken);
      const { response } = await requestWithRetry(() => this.httpClient.get(url));
      if (response.status !== 200) {
        throw new Error(`POINTS_HTTP_${response.status}`);
      }

      const value = readArray((response.json as { value?: unknown }).value);
      for (const raw of value) {
        const point = toTestPoint(raw, suiteId);
        if (point) {
          all.push(point);
        }
      }

      continuationToken = readContinuationToken(response.headers);
    } while (continuationToken);

    return all;
  }

  public async listRunsForPlan(planId: number): Promise<TestRun[]> {
    const all: TestRun[] = [];
    let skip = 0;

    while (true) {
      const url = `${this.baseUrl}/_apis/test/runs?planId=${planId}&$top=${this.runsPageSize}&$skip=${skip}&api-version=${API_VERSION_71}`;
      const { response } = await requestWithRetry(() => this.httpClient.get(url));
      if (response.status !== 200) {
        throw new Error(`RUNS_HTTP_${response.status}`);
      }

      const value = readArray((response.json as { value?: unknown }).value);
      if (value.length === 0) {
        break;
      }

      for (const raw of value) {
        const run = toTestRun(raw);
        if (run) {
          all.push(run);
        }
      }

      if (value.length < this.runsPageSize) {
        break;
      }

      skip += this.runsPageSize;
    }

    return all;
  }

  public async loadResultsForRun(runId: number): Promise<TestResult[]> {
    const all: TestResult[] = [];
    let skip = 0;

    while (true) {
      const url = `${this.baseUrl}/_apis/test/Runs/${runId}/results?$top=${this.resultsPageSize}&$skip=${skip}&detailsToInclude=Point&api-version=${API_VERSION_71}`;
      const { response } = await requestWithRetry(() => this.httpClient.get(url));
      if (response.status !== 200) {
        throw new Error(`RESULTS_HTTP_${response.status}`);
      }

      const value = readArray((response.json as { value?: unknown }).value);
      if (value.length === 0) {
        break;
      }

      for (const raw of value) {
        const result = toTestResult(raw);
        if (result) {
          all.push(result);
        }
      }

      if (value.length < this.resultsPageSize) {
        break;
      }

      skip += this.resultsPageSize;
    }

    return all;
  }

  private buildPointsUrl(planId: number, suiteId: number, continuationToken: string | undefined): string {
    const base = `${this.baseUrl}/_apis/test/Plans/${planId}/suites/${suiteId}/points?includePointDetails=true&$top=${this.pointsPageSize}&api-version=${API_VERSION_71}`;
    if (!continuationToken) {
      return base;
    }
    return `${base}&continuationToken=${encodeURIComponent(continuationToken)}`;
  }
}

type RawSuiteNode = {
  id: number;
  name: string;
  parentSuiteId: number | null;
  children: RawSuiteNode[];
};

function toSuiteNodeRaw(value: unknown): RawSuiteNode | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = readNumber(candidate.id);
  if (id === null) {
    return null;
  }
  const parentSuiteId = readNumber((candidate.parentSuite as { id?: unknown } | undefined)?.id);
  const childrenRaw = Array.isArray(candidate.children) ? candidate.children : [];
  const children = childrenRaw
    .map(toSuiteNodeRaw)
    .filter((node): node is RawSuiteNode => node !== null);

  return {
    id,
    name: typeof candidate.name === "string" ? candidate.name : String(id),
    parentSuiteId,
    children
  };
}

function findRawSuiteById(roots: RawSuiteNode[], id: number): RawSuiteNode | null {
  for (const root of roots) {
    if (root.id === id) {
      return root;
    }
    const fromChildren = findRawSuiteById(root.children, id);
    if (fromChildren) {
      return fromChildren;
    }
  }
  return null;
}

function projectSuite(
  raw: RawSuiteNode,
  parentSuiteId: number | null,
  parentPathSegments: string[]
): TestSuiteNode {
  const segments = [...parentPathSegments, raw.name];
  return {
    id: raw.id,
    name: raw.name,
    parentSuiteId,
    path: segments.join(" > "),
    children: raw.children.map((child) => projectSuite(child, raw.id, segments))
  };
}

function toTestPoint(value: unknown, fallbackSuiteId: number): TestPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const pointId = readNumber(candidate.id);
  const workItemId = readNumber((candidate.testCase as { id?: unknown } | undefined)?.id);
  if (pointId === null || workItemId === null) {
    return null;
  }

  const configuration = (candidate.configuration ?? {}) as Record<string, unknown>;
  const lastRun = (candidate.lastTestRun ?? {}) as Record<string, unknown>;
  const lastResult = (candidate.lastResult ?? {}) as Record<string, unknown>;

  return {
    pointId,
    workItemId,
    suiteId: fallbackSuiteId,
    configurationId: readNumber(configuration.id),
    configurationName: typeof configuration.name === "string" ? configuration.name : null,
    lastRunId: readNumber(lastRun.id),
    lastResultId: readNumber(lastResult.id)
  };
}

function toTestRun(value: unknown): TestRun | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const runId = readNumber(candidate.id);
  const planId = readNumber((candidate.plan as { id?: unknown } | undefined)?.id);
  if (runId === null || planId === null) {
    return null;
  }

  return {
    runId,
    planId,
    name: typeof candidate.name === "string" ? candidate.name : `Run ${runId}`,
    state: typeof candidate.state === "string" ? candidate.state : "",
    startedDate: typeof candidate.startedDate === "string" ? candidate.startedDate : null,
    completedDate: typeof candidate.completedDate === "string" ? candidate.completedDate : null,
    totalTests: readNumber(candidate.totalTests) ?? 0,
    passedTests: readNumber(candidate.passedTests) ?? 0,
    isAutomated: candidate.isAutomated === true
  };
}

function toTestResult(value: unknown): TestResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const resultId = readNumber(candidate.id);
  const runId = readNumber((candidate.testRun as { id?: unknown } | undefined)?.id);
  const testCaseReferenceId =
    readNumber(candidate.testCaseReferenceId) ??
    readNumber((candidate.testCase as { id?: unknown } | undefined)?.id);
  if (resultId === null || runId === null || testCaseReferenceId === null) {
    return null;
  }

  return {
    resultId,
    runId,
    testCaseReferenceId,
    suiteId: readNumber((candidate.testSuite as { id?: unknown } | undefined)?.id),
    pointId: readNumber((candidate.testPoint as { id?: unknown } | undefined)?.id),
    outcome: typeof candidate.outcome === "string" ? candidate.outcome : "Unspecified",
    completedDate: typeof candidate.completedDate === "string" ? candidate.completedDate : null
  };
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
