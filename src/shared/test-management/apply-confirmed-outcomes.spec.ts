import { expect, it } from 'vitest';
import { applyConfirmedOutcomes } from './apply-confirmed-outcomes.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { resetActiveServices } from '../../../tests/fixtures/reset-active.js';

it('patches only execution fields on the same physical point, preserving other suite occurrences', async () => {
  const fixture = resetActiveServices();
  const {projections} = await loadReleaseMatrix(1, fixture.services);
  const original = projections.find(p => p.suiteId === 21 && p.workItemId === 201)!;
  const update = {...original, title: 'Must not replace title', relatedIds: [999], lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null};
  const result = applyConfirmedOutcomes(projections, [update]);
  expect(result.find(p => p === original)).toBeUndefined();
  expect(result.find(p => p.suiteId === 21 && p.workItemId === 201)).toEqual({...original, lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null});
  expect(result.filter(p => p !== result.find(p => p.suiteId === 21 && p.workItemId === 201))).toEqual(projections.filter(p => p !== original));
  expect(applyConfirmedOutcomes([original], [{...update, testPointId: 999}])[0]).toBe(original);
});
