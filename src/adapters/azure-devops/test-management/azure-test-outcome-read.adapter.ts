import type { ConfirmableTestResult, TestOutcomeReadPort } from '../../../application/ports/test-outcome-read.port.js';
import type { TestPoint } from '../../../domain/test-management/test-point.js';
import type { TestRun } from '../../../domain/test-management/test-run.js';
import type { TestResult } from '../../../domain/test-management/test-result.js';
import { buildAdoBaseUrl, type AdoOrgProjectContext, type AzureRestHttpClient, type AzureHttpResponse } from '../../../shared/azure-devops/azure-rest-client.js';
import { requestWithRetry } from '../../../shared/utils/retry.js';
import { AzureTestManagementAdapter } from './azure-test-management.adapter.js';
import { readNumber, toTestPoint, toTestResult, toTestRun } from './test-management-mappers.js';

export class AzureTestOutcomeReadAdapter implements TestOutcomeReadPort {
  private readonly base: string;
  private readonly results: AzureTestManagementAdapter;
  constructor(private readonly client: AzureRestHttpClient, context: AdoOrgProjectContext, private readonly pointsPageSize = 200) {
    this.base = buildAdoBaseUrl(context) + '/_apis/test';
    this.results = new AzureTestManagementAdapter(client, context);
  }
  async isCaseInSuite(planId: number, suiteId: number, workItemId: number): Promise<boolean> {
    const response = await this.get(`${this.base}/Plans/${planId}/suites/${suiteId}/testcases/${workItemId}?api-version=7.1`, 'TEST_CASES', true);
    if (response.status === 404) return false;
    return readNumber((response.json as { testCase?: { id?: unknown } } | null)?.testCase?.id) === workItemId;
  }
  async loadPointsForCase(planId: number, suiteId: number, workItemId: number): Promise<TestPoint[]> {
    const points = new Map<number, TestPoint>();
    let skip = 0, token: string | undefined;
    const seenTokens = new Set<string>();
    while (true) {
      const query = `testCaseId=${workItemId}&includePointDetails=true&$top=${this.pointsPageSize}&$skip=${token ? 0 : skip}&api-version=7.1`
        + (token ? `&continuationToken=${encodeURIComponent(token)}` : '');
      const response = await this.get(`${this.base}/Plans/${planId}/suites/${suiteId}/points?${query}`, 'POINTS');
      const values = (response.json as { value?: unknown } | null)?.value;
      if (!Array.isArray(values)) throw new Error('POINTS_INVALID_RESPONSE');
      const before = points.size;
      for (const value of values) {
        const point = toTestPoint(value, suiteId);
        if (!point) throw new Error('POINTS_INVALID_RESPONSE');
        if (point.workItemId === workItemId) points.set(point.pointId, point);
      }
      skip += values.length;
      const next = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === 'x-ms-continuationtoken')?.[1];
      if (next) {
        if (seenTokens.has(next)) throw new Error('POINTS_REPEATED_PAGE');
        seenTokens.add(next); token = next;
      } else if (token || values.length < this.pointsPageSize) break;
      else {
        if (points.size === before) throw new Error('POINTS_REPEATED_PAGE');
        token = undefined;
      }
    }
    return [...points.values()];
  }
  async loadRun(runId: number): Promise<TestRun | null> {
    const response = await this.get(`${this.base}/runs/${runId}?api-version=7.1`, 'RUNS', true);
    return response.status === 404 ? null : toTestRun(response.json);
  }
  async loadResult(runId: number, resultId: number): Promise<ConfirmableTestResult | null> {
    const response = await this.get(`${this.base}/Runs/${runId}/results/${resultId}?detailsToInclude=Point&api-version=7.1`, 'RESULTS', true);
    if (response.status === 404) return null;
    const result = toTestResult(response.json);
    if (!result) return null;
    // A testCaseReferenceId is not Work Item identity; targeted confirmation needs the latter.
    if (readNumber((response.json as { testCase?: { id?: unknown } }).testCase?.id) !== result.workItemId) return null;
    const state = (response.json as { state?: unknown }).state;
    return { ...result, state: typeof state === 'string' ? state : '' };
  }
  loadResultsForRun(runId: number): Promise<TestResult[]> { return this.results.loadResultsForRun(runId); }
  private async get(url: string, operation: string, allowMissing = false): Promise<AzureHttpResponse> {
    const { response } = await requestWithRetry(() => this.client.get(url));
    if (response.status !== 200 && !(allowMissing && response.status === 404)) throw new Error(`${operation}_HTTP_${response.status}`);
    return response;
  }
}
