import { describe, expect, it, vi } from 'vitest';
import { AzureTestOutcomeReadAdapter } from './azure-test-outcome-read.adapter.js';
import type { AzureHttpResponse } from '../../../shared/azure-devops/azure-rest-client.js';

const context = { organization: 'org', project: 'Test Project' };
const point = (id: number) => ({ id, testCase: { id: 201 }, configuration: { id }, state: 'Ready', outcome: 'Unspecified', lastTestRun: { id: '0' }, lastResult: { id: '0' } });
const result = { id: 1000, testRun: { id: 100 }, testCase: { id: 201 }, testSuite: { id: 21 }, testPoint: { id: 21201 }, outcome: 'Passed', state: 'Completed', completedDate: '2026-09-14T10:00:00Z' };
describe('targeted outcome reads', () => {
  it('reads exactly the requested membership, run, result and new-run result list', async () => {
    const get = vi.fn(async (url: string): Promise<AzureHttpResponse> => {
      const path = new URL(url).pathname.toLowerCase();
      if (path.endsWith('/testcases/201')) return { status: 200, json: { testCase: { id: '201' } } };
      if (path.endsWith('/runs/100')) return { status: 200, json: { id: '100', plan: { id: '1' }, state: 'Completed' } };
      return { status: 200, json: path.endsWith('/results/1000') ? result : { value: [result] } };
    });
    const read = new AzureTestOutcomeReadAdapter({ get }, context);
    expect(await read.isCaseInSuite(1, 21, 201)).toBe(true);
    expect(await read.loadRun(100)).toMatchObject({ runId: 100, planId: 1, state: 'Completed' });
    expect(await read.loadResult(100, 1000)).toMatchObject({ resultId: 1000, runId: 100, state: 'Completed', pointId: 21201 });
    expect(await read.loadResultsForRun(100)).toHaveLength(1);
    expect(get.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/org/Test%20Project/_apis/test/Plans/1/suites/21/testcases/201', '/org/Test%20Project/_apis/test/runs/100',
      '/org/Test%20Project/_apis/test/Runs/100/results/1000', '/org/Test%20Project/_apis/test/Runs/100/results',
    ]);
    for (const [url] of get.mock.calls) expect(new URL(url).searchParams.get('api-version')).toBe('7.1');
  });
  it.each(['skip', 'token'] as const)('loads every configuration through %s pagination with a case filter', async mode => {
    const get = vi.fn(async (): Promise<AzureHttpResponse> => get.mock.calls.length === 1
      ? { status: 200, json: { value: [point(1), point(2)] }, ...(mode === 'token' ? { headers: { 'X-MS-ContinuationToken': 'next page' } } : {}) }
      : { status: 200, json: { value: [point(3)] } });
    const read = new AzureTestOutcomeReadAdapter({ get }, context, 2);
    expect((await read.loadPointsForCase(1, 21, 201)).map(p => p.pointId)).toEqual([1, 2, 3]);
    for (const [url] of get.mock.calls as unknown as [string][]) {
      expect(new URL(url).searchParams.get('testCaseId')).toBe('201');
      expect(new URL(url).searchParams.get('includePointDetails')).toBe('true');
    }
    const second = new URL((get.mock.calls as unknown as [string][])[1][0]);
    expect(second.searchParams.get(mode === 'token' ? 'continuationToken' : '$skip')).toBe(mode === 'token' ? 'next page' : '2');
  });
  it('does not treat a run with an omitted plan as confirmed from an unfiltered single-run URL', async () => {
    const read = new AzureTestOutcomeReadAdapter({ get: async () => ({ status: 200, json: { id: 100, state: 'Completed' } }) }, context);
    expect(await read.loadRun(100)).toBeNull();
  });
  it('ends token pagination when the final full page has no continuation token', async () => {
    const get = vi.fn(async (): Promise<AzureHttpResponse> => get.mock.calls.length === 1
      ? { status: 200, json: { value: [point(1)] }, headers: { 'x-ms-continuationtoken': 'last' } }
      : { status: 200, json: { value: [point(2)] } });
    expect(await new AzureTestOutcomeReadAdapter({ get }, context, 1).loadPointsForCase(1, 21, 201)).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('requires actual work-item identity instead of an internal case reference on confirmation', async () => {
    const read = new AzureTestOutcomeReadAdapter({ get: async () => ({ status: 200,
      json: { ...result, testCase: undefined, testCaseReferenceId: 201 } }) }, context);
    expect(await read.loadResult(100, 1000)).toBeNull();
  });
  it('treats a missing target as absent, while failing closed for malformed point pages', async () => {
    const get = vi.fn(async () => ({ status: 404, json: {} }));
    const read = new AzureTestOutcomeReadAdapter({ get }, context);
    expect(await read.isCaseInSuite(1, 21, 201)).toBe(false);
    expect(await read.loadRun(100)).toBeNull();
    expect(await read.loadResult(100, 1000)).toBeNull();
    get.mockResolvedValue({ status: 200, json: {} });
    await expect(read.loadPointsForCase(1, 21, 201)).rejects.toThrow('POINTS_INVALID_RESPONSE');
  });
  it('fails closed when pagination repeats instead of hanging or hiding configurations', async () => {
    const get = vi.fn(async () => ({ status: 200, json: { value: [point(1)] }, headers: { 'x-ms-continuationtoken': 'repeat' } }));
    await expect(new AzureTestOutcomeReadAdapter({ get }, context, 1).loadPointsForCase(1, 21, 201)).rejects.toThrow('POINTS_REPEATED_PAGE');
    expect(get).toHaveBeenCalledTimes(2);
  });
});
