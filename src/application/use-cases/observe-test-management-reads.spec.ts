import { describe, expect, it, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { createViewReadDiagnostics } from '../../shared/diagnostics/view-read-diagnostics.js';
import { observeTestManagementReads } from './observe-test-management-reads.js';

describe('observed test management reads', () => {
    it('preserves all port results and measures each uncached call', async () => {
        const { services } = matrixTestServices(), sink = vi.fn();
        const log = createViewReadDiagnostics('relations', 'read', 'server', sink);
        try {
            const observed = observeTestManagementReads(services, log), read = observed.testManagement;
            expect(await read.loadSuiteTree(1, 20)).toEqual(await services.testManagement.loadSuiteTree(1, 20));
            expect(await read.listTestCasesInSuite(1, 21)).toEqual(await services.testManagement.listTestCasesInSuite(1, 21));
            expect(await read.loadPointsForSuite(1, 21)).toEqual(await services.testManagement.loadPointsForSuite(1, 21));
            const runs = await read.listRunsForPlan(1);
            expect(runs).toEqual(await services.testManagement.listRunsForPlan(1));
            expect(await read.loadResultsForRun(runs[0].runId)).toEqual(await services.testManagement.loadResultsForRun(runs[0].runId));
            expect(await observed.testCaseHydration.hydrateTestCases([201])).toEqual(await services.testCaseHydration.hydrateTestCases([201]));
        } finally { log.finish('complete'); }
        expect(sink.mock.calls.at(-1)?.[0].operations).toMatchObject(Object.fromEntries(['tree', 'cases', 'points', 'runs', 'results', 'hydrate'].map(name => [name, { calls: 1, completed: 1 }])));
    });
    it('returns the original ports when diagnostics are absent', () => {
        const { services } = matrixTestServices();
        expect(observeTestManagementReads(services)).toBe(services);
    });
});
