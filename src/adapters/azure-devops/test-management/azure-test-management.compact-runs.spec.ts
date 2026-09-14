import { describe, expect, it } from 'vitest';
import { AzureTestManagementAdapter } from './azure-test-management.adapter.js';
import { recordMatrixOutcome } from '../../../application/use-cases/record-matrix-outcome.use-case.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';

const context = { organization: 'contract-org', project: 'contract-project' };

describe('Plan-filtered compact Azure runs', () => {
  it('retains compact runs in the requested plan and requests details on every page', async () => {
    const calls: URL[] = [];
    const pages = [
      [{ id: 10, state: 'Completed' }, { id: 11, plan: null, state: 'InProgress' }],
      [{ id: 12, state: 'Completed' }],
    ];
    const adapter = new AzureTestManagementAdapter({ get: async url => {
      calls.push(new URL(url));
      return { status: 200, json: { value: pages[calls.length - 1] ?? [] } };
    } }, context, { runsPageSize: 2 });
    const runs = await adapter.listRunsForPlan(99);
    expect(runs.map(({ runId, planId, state }) => ({ runId, planId, state }))).toEqual([
      { runId: 10, planId: 99, state: 'Completed' },
      { runId: 11, planId: 99, state: 'InProgress' },
      { runId: 12, planId: 99, state: 'Completed' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.map(url => url.searchParams.get('$skip'))).toEqual(['0', '2']);
    for (const url of calls) {
      expect(url.searchParams.get('planId')).toBe('99');
      expect(url.searchParams.get('includeRunDetails')).toBe('true');
    }
  });

  it('preserves explicit details and still rejects malformed explicit plan IDs', async () => {
    const detail = { id: '10', plan: { id: '88' }, name: 'Completed manual run', state: 'Completed',
      startedDate: '2026-01-01T10:00:00Z', completedDate: '2026-01-01T10:01:00Z', totalTests: 1, passedTests: 1, isAutomated: false };
    const adapter = new AzureTestManagementAdapter({ get: async () => ({ status: 200, json: { value: [detail,
      { id: 11, plan: { id: 'invalid' } }, { id: 12, plan: {} }, { state: 'Completed' },
    ] } }) }, context);
    expect(await adapter.listRunsForPlan(99)).toEqual([{
      runId: 10, planId: 88, name: detail.name, state: detail.state,
      startedDate: detail.startedDate, completedDate: detail.completedDate,
      totalTests: 1, passedTests: 1, isAutomated: false,
    }]);
  });

  it('confirms one NotApplicable write through the existing reader when run responses omit plan', async () => {
    const { azure, services } = matrixTestServices();
    const get = azure.client.get.bind(azure.client);
    azure.client.get = async url => {
      const response = await get(url);
      if (!new URL(url).pathname.toLowerCase().endsWith('/runs')) return response;
      const body = response.json as { value: Record<string, unknown>[] };
      return { ...response, json: { ...body, value: body.value.map(run => {
        const compact = { ...run }; delete compact.plan; return compact;
      }) } };
    };
    const saved = recordMatrixOutcome({ planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'NotApplicable' }, services);
    await expect(saved).resolves.toMatchObject({ runId: 100, projection: {
      suiteId: 21, workItemId: 201, testPointId: 21201, lastRunId: 100, lastResultId: 1000, lastOutcome: 'NotApplicable',
    } });
    expect(azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(azure.runs.at(-1)?.state).toBe('Completed');
  });
});
