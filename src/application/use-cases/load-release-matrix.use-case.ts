import type { MatrixData } from '../dto/release-matrix.dto.js';
import type { TestCatalogPort } from '../ports/test-catalog.port.js';
import type { TestPoint } from '../../domain/test-management/test-point.js';
import { flattenSuiteTree } from '../../domain/test-management/test-suite-tree.js';
import { loadTestCaseProjections, type LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
export type MatrixReadDeps = LoadTestCaseProjectionsDeps & {
    testCatalog: TestCatalogPort;
};
/** Reuses the existing suite/result aggregation without altering its matching rules. */
export async function loadReleaseMatrix(planId: number, deps: MatrixReadDeps): Promise<MatrixData> {
    const catalog = await deps.testCatalog.listSuitesForPlan(planId);
    const ids = new Set(catalog.map(s => s.id));
    const roots = catalog.filter(s => s.parentSuiteId === null || !ids.has(s.parentSuiteId));
    const points = new Map<number, TestPoint[]>();
    const read = deps.testManagement;
    const snapshot: MatrixData = { planId, suites: [], projections: [], pointCounts: {} };
    for (const root of roots) {
        const loaded = await loadTestCaseProjections({ planId, rootSuiteId: root.id }, { ...deps, testManagement: {
                loadSuiteTree: (p, s) => read.loadSuiteTree(p, s), listTestCasesInSuite: (p, s) => read.listTestCasesInSuite(p, s),
                listRunsForPlan: p => read.listRunsForPlan(p), loadResultsForRun: r => read.loadResultsForRun(r),
                loadPointsForSuite: async (p, s) => { const result = await read.loadPointsForSuite(p, s); points.set(s, result); return result; }
            } });
        snapshot.suites.push(...flattenSuiteTree(loaded.suiteTree).map(s => ({ ...s, suiteType: catalog.find(c => c.id === s.id)?.suiteType ?? null })));
        snapshot.projections.push(...loaded.projections);
    }
    snapshot.projections = [...new Map(snapshot.projections.map(p => [`${p.suiteId}:${p.workItemId}`, p])).values()];
    for (const [suiteId, list] of points)
        for (const point of list) {
            const key = `${suiteId}:${point.workItemId}`;
            snapshot.pointCounts[key] = (snapshot.pointCounts[key] ?? 0) + 1;
        }
    return snapshot;
}
