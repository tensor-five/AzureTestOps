import { expect, it } from 'vitest';
import { viewSnapshotScope } from './view-snapshot-scope.js';
const set = { id: 'set', name: 'Set', planId: '1', rootSuiteId: '10', queryId: 'query' };

it('normalizes selection order and duplicates while isolating hierarchical and flat selections', () => {
  expect(viewSnapshotScope('matrix', 'context', set, { versionSuiteIds: [30, 20, 20], flatVersionSuiteIds: [50] }))
    .toEqual(viewSnapshotScope('matrix', 'context', set, { versionSuiteIds: [20, 30], flatVersionSuiteIds: [50] }));
  expect(viewSnapshotScope('matrix', 'context', set, { versionSuiteIds: [20], flatVersionSuiteIds: [30] }))
    .not.toEqual(viewSnapshotScope('matrix', 'context', set, { versionSuiteIds: [30], flatVersionSuiteIds: [20] }));
  expect(viewSnapshotScope('matrix', 'context', set)).not.toEqual(viewSnapshotScope('matrix', 'context', set, { versionSuiteIds: [] }));
});
it.each(['id', 'name', 'planId', 'rootSuiteId', 'queryId', 'organization', 'project'] as const)('separates changes to set field %s', field => {
  expect(viewSnapshotScope('matching', 'context', { ...set, [field]: 'changed' }))
    .not.toEqual(viewSnapshotScope('matching', 'context', set));
});
