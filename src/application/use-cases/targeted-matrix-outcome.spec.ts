import { describe, expect, it, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { resetActiveServices } from '../../../tests/fixtures/reset-active.js';
import { recordMatrixOutcome } from './record-matrix-outcome.use-case.js';
import { resetMatrixPoint } from './reset-matrix-point.use-case.js';
import { loadReleaseMatrix } from './load-release-matrix.use-case.js';
import type { MatrixOutcomeTarget } from '../dto/release-matrix.dto.js';

const target: MatrixOutcomeTarget = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Passed' };
describe('bounded matrix status writes', () => {
  it.each([0, 500])('confirms one result with seven GETs and three writes independent of %s historical runs', async history => {
    const { services, azure } = matrixTestServices();
    for (let i = 0; i < history; i++) azure.runs.push({ id: 10000 + i, plan: { id: 1 }, state: 'Completed' });
    const result = await recordMatrixOutcome(target, services);
    expect(result.projection).toEqual({ suiteId: 21, workItemId: 201, testPointId: 21201, lastOutcome: 'Passed', lastRunId: 100, lastResultId: 1000, lastResultCompletedDate: expect.any(String) });
    expect(azure.reads).toHaveLength(7);
    expect(azure.writes.map(w => w.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(azure.reads.some(url => /\/suites\?|\/runs\?|\/wit\//i.test(url))).toBe(false);
    expect(azure.reads.filter(url => /\/points\?/i.test(url)).every(url => new URL(url).searchParams.get('testCaseId') === '201')).toBe(true);
    expect(azure.reads.filter(url => /\/results\?/i.test(url))).toHaveLength(1);
  });
  it('resets using only four target GETs and one PATCH, without result or run reads', async () => {
    const { services, azure } = resetActiveServices();
    const result = await resetMatrixPoint({ ...target, outcome: 'ResetToActive' }, services);
    expect(result).toEqual({ runId: null, resetToActive: true, projection: { suiteId: 21, workItemId: 201, testPointId: 21201, lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null } });
    expect(azure.reads).toHaveLength(4);
    expect(azure.reads.every(url => /\/testcases\/201\?|\/points\?/.test(url))).toBe(true);
    expect(azure.writes.map(w => w.method)).toEqual(['PATCH']);
  });
  it.each(['wrong-plan', 'wrong-run', 'wrong-result', 'wrong-case', 'wrong-point', 'wrong-suite', 'open-result', 'bad-date', 'stale-point', 'removed-case'] as const)
    ('never confirms contradictory target evidence: %s', async variant => {
      const { services, azure } = matrixTestServices();
      const read = services.outcomeRead;
      if (variant === 'wrong-plan' || variant === 'wrong-run') {
        const original = read.loadRun.bind(read);
        vi.spyOn(read, 'loadRun').mockImplementation(async id => ({ ...(await original(id))!, ...(variant === 'wrong-plan' ? { planId: 999 } : { runId: 999 }) }));
      } else if (variant === 'stale-point') {
        const original = read.loadPointsForCase.bind(read);
        vi.spyOn(read, 'loadPointsForCase').mockImplementation(async (...args) => (await original(...args)).map(p => ({ ...p, lastRunId: 1 })));
      } else if (variant === 'removed-case') {
        vi.spyOn(read, 'isCaseInSuite').mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      } else {
        const original = read.loadResult.bind(read);
        const patches = { 'wrong-result': { resultId: 999 }, 'wrong-case': { workItemId: 999 }, 'wrong-point': { pointId: 999 },
          'wrong-suite': { suiteId: 999 }, 'open-result': { state: 'InProgress' }, 'bad-date': { completedDate: 'invalid' } };
        vi.spyOn(read, 'loadResult').mockImplementation(async (...args) => ({ ...(await original(...args))!, ...patches[variant] }));
      }
      await expect(recordMatrixOutcome(target, services)).rejects.toMatchObject({ code: 'MATRIX_RUN_UNCONFIRMED', details: { runId: 100, pointId: 21201 } });
      expect(azure.writes.map(w => w.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    });
  it('preserves missing-suite fallback date while confirming the explicit physical point', async () => {
    const { services, azure } = matrixTestServices();
    azure.control.omitResultSuite = true;
    expect((await recordMatrixOutcome(target, services)).projection.lastResultCompletedDate).toBeNull();
  });
  it('keeps the same confirmed outcome after a full read with mixed suite-linked history', async () => {
    const { services, azure } = matrixTestServices();
    const original = azure.client.get.bind(azure.client);
    azure.client.get = async url => {
      const response = await original(url);
      if (!/\/runs\/100\/results(?:\/1000)?$/i.test(new URL(url).pathname)) return response;
      const json = response.json as { value?: Array<Record<string, unknown>> };
      return { ...response, json: Array.isArray(json.value)
        ? { ...json, value: json.value.map(result => ({ ...result, testSuite: null })) }
        : { ...json, testSuite: null } };
    };
    const confirmed = await recordMatrixOutcome(target, services);
    expect(confirmed.projection).toMatchObject({ lastOutcome: 'Passed', lastRunId: 100, lastResultCompletedDate: null });
    const reloaded = await loadReleaseMatrix(1, services);
    expect(reloaded.projections.find(p => p.suiteId === target.suiteId && p.workItemId === target.workItemId))
      .toMatchObject(confirmed.projection);
  });
  it.each([false, true])('rejects ambiguous configurations before write (reset: %s)', async reset => {
    const { services, azure } = resetActiveServices();
    const input = { ...target, suiteId: 23, workItemId: 302, pointId: 23302 };
    await expect(reset ? resetMatrixPoint({ ...input, outcome: 'ResetToActive' }, services) : recordMatrixOutcome(input, services))
      .rejects.toMatchObject({ code: reset ? 'MATRIX_RESET_NOT_ATTEMPTED' : 'MATRIX_WRITE_NOT_ATTEMPTED' });
    expect(azure.writes).toEqual([]);
  });
  it('waits for the parallel point read before reporting a membership failure', async () => {
    const { services, azure } = matrixTestServices();
    let release!: () => void;
    const pointsFinished = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(services.outcomeRead, 'isCaseInSuite').mockRejectedValue(new Error('read failed'));
    const points = vi.spyOn(services.outcomeRead, 'loadPointsForCase').mockImplementation(async () => { await pointsFinished; return []; });
    let finished = false;
    const pending = recordMatrixOutcome(target, services).catch(error => { finished = true; return error; });
    await Promise.resolve(); await Promise.resolve();
    expect(points).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    release();
    expect(await pending).toMatchObject({ code: 'MATRIX_WRITE_NOT_ATTEMPTED' });
    expect(azure.writes).toHaveLength(0);
  });
  it.each([400, 401, 403, 404, 422])('keeps definite HTTP%s create rejection manually retryable', async status => {
    const { services, azure } = matrixTestServices();
    vi.spyOn(azure.client, 'post').mockResolvedValue({ status, json: {} });
    await expect(recordMatrixOutcome(target, services)).rejects.toMatchObject({ code: 'MATRIX_WRITE_NOT_ATTEMPTED' });
    expect(azure.client.post).toHaveBeenCalledTimes(1);
  });
  it.each([408, 500, 502, 503, 200])('keeps ambiguous HTTP%s creation blocked even without a run ID', async status => {
    const { services, azure } = matrixTestServices();
    vi.spyOn(azure.client, 'post').mockResolvedValue({ status, json: {} });
    await expect(recordMatrixOutcome(target, services)).rejects.toMatchObject({ code: 'MATRIX_RUN_UNCONFIRMED', details: { runId: null, pointId: 21201 } });
    expect(azure.client.post).toHaveBeenCalledTimes(1);
  });
});
