import { describe, it, expect, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { loadReleaseMatrix } from './load-release-matrix.use-case.js';

describe('matrix canonical hierarchy', () => {
    it.each(['missing', 'partial', 'child-first', 'duplicate'] as const)('preserves physical suites, paths and results for %s catalog parents', async mode => {
        const baseline = await loadReleaseMatrix(1, matrixTestServices().services);
        const { services } = matrixTestServices();
        const catalog = await services.testCatalog.listSuitesForPlan(1);
        const incomplete = catalog.map((suite, index) => ({ ...suite, parentSuiteId: mode === 'partial' && index % 2 ? suite.parentSuiteId : null }));
        vi.spyOn(services.testCatalog, 'listSuitesForPlan').mockResolvedValue(mode === 'child-first' ? incomplete.reverse() : mode === 'duplicate' ? [...incomplete, ...incomplete] : incomplete);
        const runs = vi.spyOn(services.testManagement, 'listRunsForPlan');
        const results = vi.spyOn(services.testManagement, 'loadResultsForRun');
        const memberships = vi.spyOn(services.testManagement, 'listTestCasesInSuite');
        const points = vi.spyOn(services.testManagement, 'loadPointsForSuite');
        const actual = await loadReleaseMatrix(1, services);
        expect(actual).toEqual(baseline);
        expect(new Set(actual.suites.map(s => s.id)).size).toBe(17);
        expect(runs).toHaveBeenCalledTimes(1); expect(results).toHaveBeenCalledTimes(1);
        expect(memberships).toHaveBeenCalledTimes(17); expect(points).toHaveBeenCalledTimes(17);
    });
    it('shares full history across genuinely separate roots without merging their points', async () => {
        const { services } = matrixTestServices();
        const catalog = await services.testCatalog.listSuitesForPlan(1);
        vi.spyOn(services.testCatalog, 'listSuitesForPlan').mockResolvedValue(catalog.filter(s => [10, 20].includes(s.id)).map(s => ({ ...s, parentSuiteId: null })));
        const runs = vi.spyOn(services.testManagement, 'listRunsForPlan');
        const results = vi.spyOn(services.testManagement, 'loadResultsForRun');
        const snapshot = await loadReleaseMatrix(1, services);
        expect(snapshot.suites.filter(s => s.parentSuiteId === null).map(s => s.id)).toEqual([10, 20]);
        expect(runs).toHaveBeenCalledTimes(1); expect(results).toHaveBeenCalledTimes(1);
        expect(snapshot.projections.filter(p => p.workItemId === 201 && [21,22].includes(p.suiteId)).map(p => p.lastOutcome)).toEqual(['Failed', 'Passed']);
        expect(snapshot.pointCounts['23:302']).toBe(2);
    });
});
