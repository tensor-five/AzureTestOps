import type { MatrixReadDiagnostics } from '../../shared/diagnostics/matrix-read-diagnostics.js';
import type { MatrixData, MatrixResultEvidence } from '../dto/release-matrix.dto.js';
import type { TestCatalogPort } from '../ports/test-catalog.port.js';
import type { TestPoint } from '../../domain/test-management/test-point.js';
import { isActiveTestPoint } from '../../domain/test-management/active-test-point.js';
import { flattenSuiteTree, type TestSuiteNode } from '../../domain/test-management/test-suite-tree.js';
import { loadTestCaseProjections, type LoadTestCaseProjectionsDeps } from './load-test-case-projections.use-case.js';
import { createMatrixReadSession } from './matrix-read-session.js';
export type MatrixReadDeps = LoadTestCaseProjectionsDeps & {
    testCatalog: TestCatalogPort;
};
/** Reuses the existing suite/result aggregation without altering its matching rules. */
export async function loadReleaseMatrix(planId: number, deps: MatrixReadDeps, options: { signal?: AbortSignal; diagnostics?: MatrixReadDiagnostics; versionSuiteIds?: readonly number[] } = {}): Promise<MatrixData> {
    options.signal?.throwIfAborted();
    const catalog = await (options.diagnostics ? options.diagnostics.measure('catalog', { planId }, () => deps.testCatalog.listSuitesForPlan(planId)) : deps.testCatalog.listSuitesForPlan(planId));
    const ids = new Set(catalog.map(s => s.id));
    const roots = catalog.filter(s => s.parentSuiteId === null || !ids.has(s.parentSuiteId));
    options.diagnostics?.progress({ planId, catalogSuiteCount: catalog.length, candidateRootCount: roots.length, missingParentCount: roots.length, duplicateCatalogSuiteIdCount: catalog.length - ids.size });
    let skippedOverlappingRoots = 0, overlappingSuiteCount = 0;
    const points = new Map<number, TestPoint[]>();
    const completedRunIds = new Set<number>();
    const rawResults = new Map<string, MatrixResultEvidence>();
    const session = createMatrixReadSession(deps, options);
    const read = session.testManagement;
    // The flat catalog can omit parent IDs. Resolve its candidates against the actual tree
    // before aggregation, so child-first catalogs cannot overwrite complete paths with subtrees.
    const discovered = new Set<number>();
    const trees = new Map<number, TestSuiteNode>();
    for (const root of roots) {
        if (discovered.has(root.id)) { skippedOverlappingRoots++; continue; }
        const tree = await read.loadSuiteTree(planId, root.id);
        const entries = flattenSuiteTree(tree);
        for (const entry of entries) {
            if (discovered.has(entry.id)) overlappingSuiteCount++;
            discovered.add(entry.id);
            if (entry.id !== tree.id) trees.delete(entry.id);
        }
        trees.set(tree.id, tree);
    }
    options.diagnostics?.progress({ canonicalRootCount: trees.size, skippedOverlappingRoots, overlappingSuiteCount });
    for (const id of ids) if (!discovered.has(id))
        throw new Error(`Suite-Baum unvollständig: Suite #${id} fehlt in der geladenen Hierarchie.`);
    const snapshot: MatrixData = { planId, suites: [], projections: [], pointCounts: {}, suiteMemberships: {} };
    const suiteTypes = new Map(catalog.map(suite => [suite.id, suite.suiteType]));
    const allSuites = [...trees.values()].flatMap(flattenSuiteTree);
    const byId = new Map(allSuites.map(s => [s.id, s]));
    const selected = options.versionSuiteIds ? new Set(options.versionSuiteIds) : null;
    // Rows use direct version → environment → content hierarchy. Keep the complete catalog for selection.
    const includedSuiteIds = selected ? new Set(allSuites.filter(s => {
        const environment = s.parentSuiteId === null ? undefined : byId.get(s.parentSuiteId);
        return environment?.parentSuiteId !== null && environment?.parentSuiteId !== undefined && selected.has(environment.parentSuiteId);
    }).map(s => s.id)) : undefined;
    for (const root of trees.values()) {
        const loaded = await loadTestCaseProjections({ planId, rootSuiteId: root.id, includedSuiteIds }, session);
        for (const run of loaded.runs) if (run.state === 'Completed') completedRunIds.add(run.runId);
        for (const result of loaded.results) rawResults.set(`${result.runId}:${result.resultId}`, result);
        for (const [suite, list] of loaded.pointsBySuiteId) points.set(suite, list);
        for (const [suite, caseIds] of loaded.testCasesBySuiteId) snapshot.suiteMemberships![String(suite)] = [...new Set(caseIds)];
        snapshot.suites.push(...flattenSuiteTree(loaded.suiteTree).map(s => ({ ...s, suiteType: suiteTypes.get(s.id) ?? null })));
        snapshot.projections.push(...loaded.projections);
    }
    const canonicalSuites = new Map<number, MatrixData['suites'][number]>();
    for (const suite of snapshot.suites) {
        const previous = canonicalSuites.get(suite.id);
        if (!previous || suite.depth > previous.depth) canonicalSuites.set(suite.id, suite);
    }
    options.diagnostics?.progress({ suiteCount: canonicalSuites.size, duplicateSuiteIdCount: snapshot.suites.length - canonicalSuites.size });
    snapshot.suites = [...canonicalSuites.values()];
    snapshot.completedRunIds = [...completedRunIds];
    snapshot.projections = [...new Map(snapshot.projections.map(p => [`${p.suiteId}:${p.workItemId}`, {
        ...p, suitePath: canonicalSuites.get(p.suiteId)?.path ?? p.suitePath,
    }])).values()];
    // Only current run/case evidence is needed by the client; do not transmit the full run history.
    const currentResults = new Set(snapshot.projections.map(p => `${p.lastRunId}:${p.workItemId}`));
    snapshot.resultEvidence = [...rawResults.values()].filter(result => currentResults.has(`${result.runId}:${result.workItemId}`));
    snapshot.activePoints = [...points.values()].flat().filter(isActiveTestPoint)
        .map(({ pointId, suiteId, workItemId }) => ({ pointId, suiteId, workItemId }));
    for (const [suiteId, list] of points)
        for (const point of list) {
            const key = `${suiteId}:${point.workItemId}`;
            snapshot.pointCounts[key] = (snapshot.pointCounts[key] ?? 0) + 1;
        }
    options.signal?.throwIfAborted();
    options.diagnostics?.progress({ projectionCount: snapshot.projections.length, pointCount: [...points.values()].reduce((total, list) => total + list.length, 0) });
    return snapshot;
}
