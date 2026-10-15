import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { createMatrixColumnHierarchy } from '../../domain/release-matrix/matrix-column-hierarchy.js';
export type MatrixRow = { environment: string; content: string; workItemId: number; title: string; tags: string[]; combinedEnvironments?: true };
export type MatrixGroup = { id: string; name: string; rows: MatrixRow[] };
export type MatrixRowContext = Pick<MatrixRow, 'environment' | 'content'>;
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
export const mappingKey = (row: MatrixRowContext, columnId: string): string => JSON.stringify([row.environment,row.content,columnId]);
export const matrixRowKey = (row: MatrixRow): string => JSON.stringify(row.combinedEnvironments ? [row.content,row.workItemId] : [row.environment,row.content,row.workItemId]);
export const effectiveMatrixGrouping = (config: MatrixConfig) => config.separateEnvironments === false ? 'content' : config.grouping;
export function versionTitle(snapshot: MatrixSnapshot, column: MatrixColumn): string {
    return snapshot.suites.find(s=>s.id===column.versionSuiteId)?.name ?? (column.versionSuiteId?`Versions-Suite #${column.versionSuiteId} ungültig`:'Versions-Suite auswählen');
}
export function visibleVersionColumns(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixColumn[] {
    if (snapshot.planId !== config.planId) return [];
    const suiteIds = new Set(snapshot.suites.map(suite=>suite.id));
    return config.columns.filter(column=>column.visible&&column.versionSuiteId>0&&suiteIds.has(column.versionSuiteId));
}
export function resolveSource(snapshot: MatrixSnapshot, config: MatrixConfig, row: MatrixRowContext, column: MatrixColumn) {
    const hierarchy = createMatrixColumnHierarchy(snapshot.suites)(column);
    const version = snapshot.planId === config.planId ? hierarchy.version : undefined;
    const environmentIds = new Set(version ? snapshot.suites.filter(s=>s.parentSuiteId===version.id&&s.name===row.environment).map(s=>s.id) : []);
    const candidates = version ? hierarchy.contents.filter(entry => entry.suite.name === row.content &&
        (column.hasEnvironmentLevel === false || entry.environment === row.environment)).map(entry => entry.suite) : [];
    const explicit = config.mappings[mappingKey(row,column.id)];
    const suite = explicit ? candidates.find(s=>s.id===explicit) : candidates.length===1?candidates[0]:undefined;
    const ambiguous = !explicit&&candidates.length>1;
    const reason = !version ? (column.versionSuiteId?'Versions-Suite ist im aktiven Plan ungültig.':'Versions-Suite auswählen.') : suite ? ''
        : explicit ? 'Gespeicherte Suite-Zuordnung ist ungültig. Bitte erneut auswählen.'
        : ambiguous ? 'Suite zuordnen: mehrere direkte Pfade mit demselben Inhalt.'
        : column.hasEnvironmentLevel === false ? 'Inhaltliche Suite fehlt direkt unter dieser Version.'
        : environmentIds.size ? 'Inhaltliche Suite fehlt unter dieser Versions- und Umgebungs-Suite.' : 'Umgebungs-Suite fehlt unter dieser Version.';
    return {suite,candidates,ambiguous,reason};
}
/** Each column determines whether content sits directly below its version or below an environment. */
export function catalogRows(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixRow[] {
    const hierarchy = createMatrixColumnHierarchy(snapshot.suites);
    const contents = new Map<number, Array<{ content: string; environment: string }>>();
    for (const column of visibleVersionColumns(snapshot, config)) for (const {suite, environment} of hierarchy(column).contents) {
        const contexts = contents.get(suite.id) ?? [];
        contexts.push({content:suite.name, environment});
        contents.set(suite.id, contexts);
    }
    const rows = new Map<string,MatrixRow>();
    for (const projection of snapshot.projections) {
        for (const context of contents.get(projection.suiteId) ?? []) {
            const row: MatrixRow = {environment:config.separateEnvironments === false ? '' : context.environment,content:context.content,workItemId:projection.workItemId,title:projection.title,tags:projection.tags,
                ...(config.separateEnvironments === false ? {combinedEnvironments:true as const} : {})};
            if (!rows.has(matrixRowKey(row))) rows.set(matrixRowKey(row),row);
        }
    }
    // A flat source compares against each existing environment row; only flat-only cases need their own row.
    const contextualCases = new Set([...rows.values()].filter(row => row.environment !== '').map(row => JSON.stringify([row.content,row.workItemId])));
    return [...rows.values()].filter(row => row.environment !== '' || !contextualCases.has(JSON.stringify([row.content,row.workItemId])));
}
const normalizedTag = (tag:string)=>tag.trim().toLocaleLowerCase();
export function matrixGroups(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixGroup[] {
    const memberIds = new Set(snapshot.suiteMemberships
        ? snapshot.suiteMemberships[config.suiteFilter] ?? []
        : snapshot.projections.filter(p=>String(p.suiteId)===config.suiteFilter).map(p=>p.workItemId));
    const rows = catalogRows(snapshot,config).filter(row=>(!config.search||`${row.workItemId} ${row.title}`.toLocaleLowerCase().includes(config.search.toLocaleLowerCase()))
        &&(!config.tagFilter||row.tags.some(tag=>normalizedTag(tag)===normalizedTag(config.tagFilter)))&&(!config.suiteFilter||memberIds.has(row.workItemId)))
        .sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'})||a.workItemId-b.workItemId||matrixRowKey(a).localeCompare(matrixRowKey(b)));
    const grouping = effectiveMatrixGrouping(config);
    const names = [...new Set(rows.map(row=>row[grouping]))].sort((a,b)=>a.localeCompare(b));
    const order = config.groupOrderByMode[grouping];
    const rank = (name:string)=>{const index=order.indexOf(name);return index<0?Infinity:index;};
    return names.map(name=>({id:name,name:grouping==='environment'&&name===''?'Ohne Umgebung':name,rows:rows.filter(row=>row[grouping]===name)})).sort((a,b)=>rank(a.id)-rank(b.id));
}
