import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
export type MatrixRow = { environment: string; content: string; workItemId: number; title: string; tags: string[] };
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
export const matrixRowKey = (row: MatrixRow): string => JSON.stringify([row.environment,row.content,row.workItemId]);
export function versionTitle(snapshot: MatrixSnapshot, column: MatrixColumn): string {
    return snapshot.suites.find(s=>s.id===column.versionSuiteId)?.name ?? (column.versionSuiteId?`Versions-Suite #${column.versionSuiteId} ungültig`:'Versions-Suite auswählen');
}
export function visibleVersionColumns(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixColumn[] {
    if (snapshot.planId !== config.planId) return [];
    const suiteIds = new Set(snapshot.suites.map(suite=>suite.id));
    return config.columns.filter(column=>column.visible&&column.versionSuiteId>0&&suiteIds.has(column.versionSuiteId));
}
export function resolveSource(snapshot: MatrixSnapshot, config: MatrixConfig, row: MatrixRowContext, column: MatrixColumn) {
    const version = snapshot.planId === config.planId ? snapshot.suites.find(s=>s.id===column.versionSuiteId) : undefined;
    const environmentIds = new Set(version ? snapshot.suites.filter(s=>s.parentSuiteId===version.id&&s.name===row.environment).map(s=>s.id) : []);
    const candidates = [...new Map(snapshot.suites.filter(s=>s.parentSuiteId!==null&&environmentIds.has(s.parentSuiteId)&&s.name===row.content).map(s=>[s.id,s])).values()];
    const explicit = config.mappings[mappingKey(row,column.id)];
    const suite = explicit ? candidates.find(s=>s.id===explicit) : candidates.length===1?candidates[0]:undefined;
    const ambiguous = !explicit&&candidates.length>1;
    const reason = !version ? (column.versionSuiteId?'Versions-Suite ist im aktiven Plan ungültig.':'Versions-Suite auswählen.') : suite ? ''
        : explicit ? 'Gespeicherte Suite-Zuordnung ist ungültig. Bitte erneut auswählen.'
        : ambiguous ? 'Suite zuordnen: mehrere direkte Pfade mit derselben Umgebung und demselben Inhalt.'
        : environmentIds.size ? 'Inhaltliche Suite fehlt unter dieser Versions- und Umgebungs-Suite.' : 'Umgebungs-Suite fehlt unter dieser Version.';
    return {suite,candidates,ambiguous,reason};
}
/** Selected version roots supply direct environment/content memberships; physical projections remain untouched. */
export function catalogRows(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixRow[] {
    const versionIds = new Set(visibleVersionColumns(snapshot,config).map(column=>column.versionSuiteId));
    const environments = new Map(snapshot.suites.filter(suite=>suite.parentSuiteId!==null&&versionIds.has(suite.parentSuiteId)).map(suite=>[suite.id,suite]));
    const contents = new Map(snapshot.suites.filter(suite=>suite.parentSuiteId!==null&&environments.has(suite.parentSuiteId)).map(suite=>[suite.id,suite]));
    const rows = new Map<string,MatrixRow>();
    for (const projection of snapshot.projections) {
        const content = contents.get(projection.suiteId);
        const environment = content?.parentSuiteId == null ? undefined : environments.get(content.parentSuiteId);
        if (!content||!environment) continue;
        const row = {environment:environment.name,content:content.name,workItemId:projection.workItemId,title:projection.title,tags:projection.tags};
        if (!rows.has(matrixRowKey(row))) rows.set(matrixRowKey(row),row);
    }
    return [...rows.values()];
}
const normalizedTag = (tag:string)=>tag.trim().toLocaleLowerCase();
export function matrixGroups(snapshot: MatrixSnapshot, config: MatrixConfig): MatrixGroup[] {
    const memberIds = new Set(snapshot.suiteMemberships
        ? snapshot.suiteMemberships[config.suiteFilter] ?? []
        : snapshot.projections.filter(p=>String(p.suiteId)===config.suiteFilter).map(p=>p.workItemId));
    const rows = catalogRows(snapshot,config).filter(row=>(!config.search||`${row.workItemId} ${row.title}`.toLocaleLowerCase().includes(config.search.toLocaleLowerCase()))
        &&(!config.tagFilter||row.tags.some(tag=>normalizedTag(tag)===normalizedTag(config.tagFilter)))&&(!config.suiteFilter||memberIds.has(row.workItemId)))
        .sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'})||a.workItemId-b.workItemId||matrixRowKey(a).localeCompare(matrixRowKey(b)));
    const names = [...new Set(rows.map(row=>row[config.grouping]))].sort((a,b)=>a.localeCompare(b));
    const order = config.groupOrderByMode[config.grouping];
    const rank = (name:string)=>{const index=order.indexOf(name);return index<0?Infinity:index;};
    return names.map(name=>({id:name,name,rows:rows.filter(row=>row[config.grouping]===name)})).sort((a,b)=>rank(a.id)-rank(b.id));
}
