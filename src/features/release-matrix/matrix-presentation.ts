import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
export type MatrixRow = { groupName: string; workItemId: number; title: string; tags: string[] };
export type MatrixGroup = { id: string; name: string; rows: MatrixRow[] };
export function descendantIds(snapshot: MatrixSnapshot, root: number): Set<number> {
    const byId = new Set(snapshot.suites.map(s => s.id));
    const children = new Map<number, number[]>();
    for (const suite of snapshot.suites) if (suite.parentSuiteId !== null) {
        const list = children.get(suite.parentSuiteId) ?? []; list.push(suite.id); children.set(suite.parentSuiteId, list);
    }
    const found = new Set<number>(), queue = [root];
    while (queue.length) {
        const id = queue.pop()!;
        if (found.has(id) || !byId.has(id)) continue;
        found.add(id); queue.push(...(children.get(id) ?? []));
    }
    return found;
}
export const mappingKey = (name: string, columnId: string): string => JSON.stringify([name, columnId]);
export const matrixRowKey = (row: MatrixRow): string => JSON.stringify([row.groupName, row.workItemId]);
const normalizedTag = (tag: string) => tag.trim().toLocaleLowerCase();
export function resolveSource(snapshot: MatrixSnapshot, config: MatrixConfig, name: string, column: MatrixColumn) {
    const tag = normalizedTag(column.tag);
    const tagged = tag && snapshot.planId === config.planId ? [...new Map(snapshot.suites.filter(s => s.tags.some(t => normalizedTag(t) === tag)).map(s => [s.id, s])).values()] : [];
    const candidates = tagged.filter(s => s.name === name);
    const explicit = config.mappings[mappingKey(name, column.id)];
    const suite = explicit ? tagged.find(s => s.id === explicit) : candidates.length === 1 ? candidates[0] : undefined;
    const ambiguous = !explicit && candidates.length > 1;
    const reason = !tag ? 'Suite-Tag auswählen.' : suite ? '' : explicit ? 'Gespeicherte Suite-Zuordnung ist ungültig. Bitte erneut auswählen.'
        : ambiguous ? 'Suite zuordnen: mehrere gleichnamige Suites mit diesem Suite-Tag.' : 'Suite fehlt für diesen Suite-Tag.';
    return { suite, candidates, ambiguous, reason };
}
/** Display identity only: every outcome remains on its original physical projection. */
export function catalogRows(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixRow[] {
    const ids = descendantIds(snapshot, config.catalogRootId);
    const names = new Map(snapshot.suites.map(s => [s.id, s.name]));
    const rows = new Map<string, MatrixRow>();
    for (const projection of snapshot.projections) {
        const name = names.get(projection.suiteId);
        if (!ids.has(projection.suiteId) || name === undefined) continue;
        const row = { groupName: name, workItemId: projection.workItemId, title: projection.title, tags: projection.tags };
        if (!rows.has(matrixRowKey(row))) rows.set(matrixRowKey(row), row);
    }
    return [...rows.values()];
}
export function matrixGroups(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixGroup[] {
    const memberIds = new Set(snapshot.projections.filter(p => String(p.suiteId) === config.suiteFilter).map(p => p.workItemId));
    const rows = catalogRows(snapshot, config).filter(p => (!config.search || `${p.workItemId} ${p.title}`.toLocaleLowerCase().includes(config.search.toLocaleLowerCase())) && (!config.tagFilter || p.tags.some(t => normalizedTag(t) === normalizedTag(config.tagFilter))) && (!config.suiteFilter || memberIds.has(p.workItemId)))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.workItemId - b.workItemId || a.groupName.localeCompare(b.groupName));
    if (config.grouping === 'tags') {
        const groups = config.tags.map(t => ({ id: `tag:${normalizedTag(t)}`, name: t, rows: rows.filter(p => p.tags.some(pt => normalizedTag(pt) === normalizedTag(t))) }));
        groups.push({ id: 'untagged', name: 'Ohne Gruppierungs-Tag', rows: rows.filter(p => !p.tags.some(pt => config.tags.some(t => normalizedTag(t) === normalizedTag(pt)))) });
        return groups.filter(g => g.rows.length);
    }
    const names = [...new Set(rows.map(row => row.groupName))].sort((a, b) => a.localeCompare(b));
    const groups = names.map(name => ({ id: name, name, rows: rows.filter(row => row.groupName === name) }));
    const rank = (id: string) => { const index = config.groupOrder.indexOf(id); return index < 0 ? Infinity : index; };
    return groups.sort((a, b) => rank(a.id) - rank(b.id));
}
