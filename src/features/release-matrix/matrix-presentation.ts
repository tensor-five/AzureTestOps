import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import { buildMatrixSuiteLabels } from './matrix-suite-labels.js';
export type MatrixGroup = {
    id: string;
    name: string;
    rows: TestCaseProjection[];
};
export function descendantIds(snapshot: MatrixSnapshot, root: number): Set<number> {
    const found = new Set<number>();
    const queue = [root];
    while (queue.length) {
        const id = queue.pop()!;
        if (found.has(id) || !snapshot.suites.some(s => s.id === id))
            continue;
        found.add(id);
        queue.push(...snapshot.suites.filter(s => s.parentSuiteId === id).map(s => s.id));
    }
    return found;
}
export const mappingKey = (catalogSuiteId: number, columnId: string): string => `${catalogSuiteId}:${columnId}`;
export function resolveSource(snapshot: MatrixSnapshot, config: MatrixConfig, suiteId: number, column: MatrixColumn) {
    const ids = descendantIds(snapshot, column.rootSuiteId);
    const candidates = snapshot.suites.filter(s => ids.has(s.id));
    const explicit = config.mappings[mappingKey(suiteId, column.id)];
    if (explicit)
        return { suite: candidates.find(s => s.id === explicit), candidates, ambiguous: false };
    const name = snapshot.suites.find(s => s.id === suiteId)?.name;
    const matches = candidates.filter(s => s.name === name);
    const catalogIds = descendantIds(snapshot, config.catalogRootId);
    if (snapshot.suites.filter(s => catalogIds.has(s.id) && s.name === name).length > 1)
        return { suite: undefined, candidates, ambiguous: true };
    return { suite: matches.length === 1 ? matches[0] : undefined, candidates, ambiguous: matches.length > 1 };
}
export function catalogRows(snapshot: MatrixSnapshot, config: MatrixConfig): TestCaseProjection[] {
    const ids = descendantIds(snapshot, config.catalogRootId);
    return snapshot.projections.filter(p => ids.has(p.suiteId));
}
export function catalogSuiteLabels(snapshot: MatrixSnapshot, config: MatrixConfig): Map<number, string> {
    const ids = descendantIds(snapshot, config.catalogRootId);
    return buildMatrixSuiteLabels(snapshot.suites.filter(suite => ids.has(suite.id)), config.catalogRootId);
}
export function matrixGroups(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixGroup[] {
    const memberIds = new Set(snapshot.projections.filter(p => String(p.suiteId) === config.suiteFilter).map(p => p.workItemId));
    const tag = (t: string) => t.toLocaleLowerCase();
    const rows = catalogRows(snapshot, config).filter(p => (!config.search || `${p.workItemId} ${p.title}`.toLocaleLowerCase().includes(config.search.toLocaleLowerCase())) && (!config.tagFilter || p.tags.some(t => tag(t) === tag(config.tagFilter))) && (!config.suiteFilter || memberIds.has(p.workItemId)))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.workItemId - b.workItemId || a.suiteId - b.suiteId);
    if (config.grouping === 'tags') {
        const groups = config.tags.map(t => ({ id: `tag:${t.toLowerCase()}`, name: t, rows: rows.filter(p => p.tags.some(pt => tag(pt) === tag(t))) }));
        groups.push({ id: 'untagged', name: 'Ohne Gruppierungs-Tag', rows: rows.filter(p => !p.tags.some(pt => config.tags.some(t => tag(t) === tag(pt)))) });
        return groups.filter(g => g.rows.length);
    }
    const labels = catalogSuiteLabels(snapshot, config);
    const groups = snapshot.suites.map(s => ({ id: String(s.id), name: labels.get(s.id) ?? s.name, rows: rows.filter(p => p.suiteId === s.id) })).filter(g => g.rows.length);
    const rank = (id: string) => { const i = config.groupOrder.indexOf(id); return i < 0 ? Infinity : i; };
    return groups.sort((a, b) => rank(a.id) - rank(b.id));
}
