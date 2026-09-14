import { describe, expect, it, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { readOutcomeTarget, settleOutcomeReads, validateOutcomeTargetIds } from './matrix-outcome-target.js';

const target = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201 };
describe('physical outcome target', () => {
  it.each([0, -1, 1.5, NaN, Infinity])('rejects an invalid physical point ID %s', pointId => {
    expect(() => validateOutcomeTargetIds({ ...target, pointId })).toThrow('Schreibziel');
  });
  it('preserves all configurations and reads only the requested case', async () => {
    const { services } = matrixTestServices();
    const member = vi.spyOn(services.outcomeRead, 'isCaseInSuite');
    const points = vi.spyOn(services.outcomeRead, 'loadPointsForCase');
    const value = await readOutcomeTarget({ ...target, suiteId: 23, workItemId: 302 }, services.outcomeRead);
    expect(value.caseFound).toBe(true);
    expect(value.points).toHaveLength(2);
    expect(member).toHaveBeenCalledExactlyOnceWith(1, 23, 302);
    expect(points).toHaveBeenCalledExactlyOnceWith(1, 23, 302);
  });
  it('retains tuple order for independent reads', async () => {
    expect(await settleOutcomeReads([Promise.resolve(true), Promise.resolve(2)] as const)).toEqual([true, 2]);
  });
});
