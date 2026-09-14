import type { MatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';

/** Shares identical reads only within one matrix request; writes and later reads never reuse this cache. */
export function createMatrixReadSession(deps: LoadTestCaseProjectionsDeps, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics } = {}): LoadTestCaseProjectionsDeps {
    const promises = new Map<string, Promise<unknown>>();
    const once = <T>(key: string, read: () => Promise<T>): Promise<T> => {
        options.signal?.throwIfAborted();
        const previous = promises.get(key);
        if (previous) return previous as Promise<T>;
        const [operation, first, second] = key.split(':');
        const ids: Record<string, number> = operation === 'hydrate' ? {} : operation === 'results' ? { runId: Number(first) } : { planId: Number(first), ...(second ? { suiteId: Number(second) } : {}) };
        const pending = options.diagnostics ? options.diagnostics.measure(operation, ids, read) : read();
        promises.set(key, pending);
        return pending;
    };
    return {
        ...deps,
        testManagement: {
            loadSuiteTree: (plan, suite) => once(`tree:${plan}:${suite}`, () => deps.testManagement.loadSuiteTree(plan, suite)),
            listTestCasesInSuite: (plan, suite) => once(`cases:${plan}:${suite}`, () => deps.testManagement.listTestCasesInSuite(plan, suite)),
            loadPointsForSuite: (plan, suite) => once(`points:${plan}:${suite}`, () => deps.testManagement.loadPointsForSuite(plan, suite)),
            listRunsForPlan: plan => once(`runs:${plan}`, () => deps.testManagement.listRunsForPlan(plan)),
            loadResultsForRun: run => once(`results:${run}`, () => deps.testManagement.loadResultsForRun(run)),
        },
        testCaseHydration: {
            hydrateTestCases: ids => {
                const normalized = [...new Set(ids)].sort((a, b) => a - b);
                return once(`hydrate:${normalized.join(',')}`, () => deps.testCaseHydration.hydrateTestCases(normalized));
            },
        },
    };
}
