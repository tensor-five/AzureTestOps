import type { ViewReadDiagnostics } from '../../shared/diagnostics/view-read-diagnostics.js';
import type { LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';

/** Observes port calls without changing their ordering, caching or return values. */
export function observeTestManagementReads(deps: LoadTestCaseProjectionsDeps, diagnostics?: ViewReadDiagnostics): LoadTestCaseProjectionsDeps {
    if (!diagnostics) return deps;
    const read = deps.testManagement;
    return {
        ...deps,
        testManagement: {
            loadSuiteTree: (planId, suiteId) => diagnostics.measure('tree', { planId, suiteId }, () => read.loadSuiteTree(planId, suiteId)),
            listTestCasesInSuite: (planId, suiteId) => diagnostics.measure('cases', { planId, suiteId }, () => read.listTestCasesInSuite(planId, suiteId)),
            loadPointsForSuite: (planId, suiteId) => diagnostics.measure('points', { planId, suiteId }, () => read.loadPointsForSuite(planId, suiteId)),
            listRunsForPlan: planId => diagnostics.measure('runs', { planId }, () => read.listRunsForPlan(planId)),
            loadResultsForRun: runId => diagnostics.measure('results', { runId }, () => read.loadResultsForRun(runId)),
        },
        testCaseHydration: { hydrateTestCases: ids => diagnostics.measure('hydrate', {}, () => deps.testCaseHydration.hydrateTestCases(ids)) },
    };
}
