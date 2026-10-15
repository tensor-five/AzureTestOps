import type { MatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
import { observeTestManagementReads } from './observe-test-management-reads.js';
import { combinedAbortSignal } from '../../shared/utils/combined-abort-signal.js';

/** Shares identical reads only within one matrix request; optional completed-history reuse has a separate bounded port. */
export function createMatrixReadSession(deps: LoadTestCaseProjectionsDeps, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics } = {}): LoadTestCaseProjectionsDeps {
    const observed = observeTestManagementReads(deps, options.diagnostics);
    const promises = new Map<string, { pending: Promise<unknown>; signal?: AbortSignal; fulfilled: boolean }>();
    const once = <T>(key: string, read: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> => {
        const readSignal = combinedAbortSignal(options.signal ?? deps.signal, signal);
        readSignal?.throwIfAborted();
        const previous = promises.get(key);
        if (previous && (previous.fulfilled || previous.signal === signal)) return previous.pending.then(value => {
            readSignal?.throwIfAborted();
            return value as T;
        });
        const entry = { pending: Promise.resolve(undefined) as Promise<unknown>, signal, fulfilled: false };
        const pending = read(readSignal).then(value => {
            readSignal?.throwIfAborted();
            entry.fulfilled = true;
            return value;
        }).catch(error => {
            if (promises.get(key) === entry) promises.delete(key);
            throw error;
        });
        entry.pending = pending;
        promises.set(key, entry);
        return pending;
    };
    return {
        ...deps,
        signal: options.signal ?? deps.signal,
        ...(deps.testResultHistory ? { testResultHistory: {
            loadPlanResults: (planId, historyOptions) => once(`history:${planId}`, readSignal => deps.testResultHistory!.loadPlanResults(planId, { ...historyOptions, signal: readSignal }), historyOptions.signal)
        } } : {}),
        testManagement: {
            loadSuiteTree: (plan, suite) => once(`tree:${plan}:${suite}`, () => observed.testManagement.loadSuiteTree(plan, suite)),
            listTestCasesInSuite: (plan, suite) => once(`cases:${plan}:${suite}`, () => observed.testManagement.listTestCasesInSuite(plan, suite)),
            loadPointsForSuite: (plan, suite) => once(`points:${plan}:${suite}`, () => observed.testManagement.loadPointsForSuite(plan, suite)),
            listRunsForPlan: (plan, signal) => once(`runs:${plan}`, readSignal => observed.testManagement.listRunsForPlan(plan, readSignal), signal),
            loadResultsForRun: (run, signal) => once(`results:${run}`, readSignal => observed.testManagement.loadResultsForRun(run, readSignal), signal),
        },
        testCaseHydration: {
            hydrateTestCases: ids => {
                const normalized = [...new Set(ids)].sort((a, b) => a - b);
                return once(`hydrate:${normalized.join(',')}`, () => observed.testCaseHydration.hydrateTestCases(normalized));
            },
        },
    };
}
