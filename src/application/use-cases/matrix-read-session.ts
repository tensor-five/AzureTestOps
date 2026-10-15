import type { MatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
import { observeTestManagementReads } from './observe-test-management-reads.js';

/** Shares identical reads only within one matrix request; writes and later reads never reuse this cache. */
export function createMatrixReadSession(deps: LoadTestCaseProjectionsDeps, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics } = {}): LoadTestCaseProjectionsDeps {
    const observed = observeTestManagementReads(deps, options.diagnostics);
    const promises = new Map<string, Promise<unknown>>();
    const once = <T>(key: string, read: () => Promise<T>): Promise<T> => {
        options.signal?.throwIfAborted();
        const previous = promises.get(key);
        if (previous) return previous as Promise<T>;
        const pending = read();
        promises.set(key, pending);
        return pending;
    };
    return {
        ...deps,
        signal: options.signal ?? deps.signal,
        testManagement: {
            loadSuiteTree: (plan, suite) => once(`tree:${plan}:${suite}`, () => observed.testManagement.loadSuiteTree(plan, suite)),
            listTestCasesInSuite: (plan, suite) => once(`cases:${plan}:${suite}`, () => observed.testManagement.listTestCasesInSuite(plan, suite)),
            loadPointsForSuite: (plan, suite) => once(`points:${plan}:${suite}`, () => observed.testManagement.loadPointsForSuite(plan, suite)),
            listRunsForPlan: plan => once(`runs:${plan}`, () => observed.testManagement.listRunsForPlan(plan)),
            loadResultsForRun: run => once(`results:${run}`, () => observed.testManagement.loadResultsForRun(run)),
        },
        testCaseHydration: {
            hydrateTestCases: ids => {
                const normalized = [...new Set(ids)].sort((a, b) => a - b);
                return once(`hydrate:${normalized.join(',')}`, () => observed.testCaseHydration.hydrateTestCases(normalized));
            },
        },
    };
}
