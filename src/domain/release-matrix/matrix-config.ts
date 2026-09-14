export type MatrixColumn = { id: string; versionSuiteId: number; visible: boolean };
export type MatrixGrouping = 'environment' | 'content';
export type MatrixGroupState = Record<MatrixGrouping, string[]>;
export const DEFAULT_MATRIX_TITLE_COLUMN_WIDTH = 350;
export const MIN_MATRIX_TITLE_COLUMN_WIDTH = 240;
export const MAX_MATRIX_TITLE_COLUMN_WIDTH = 900;
export const MATRIX_TITLE_COLUMN_WIDTH_STEP = 20;
export type MatrixConfig = {
    version: 3;
    /** Preserve the migration explanation across server and browser sanitization. */
    migratedFrom?: 1 | 2;
    planId: number;
    catalogRootId: number;
    grouping: MatrixGrouping;
    /** Absent in older v3 preferences; those keep separate environment rows. */
    separateEnvironments?: boolean;
    /** Physical source per content, case and column in the combined view only. */
    combinedMappings?: Record<string, number>;
    columns: MatrixColumn[];
    mappings: Record<string, number>;
    groupOrderByMode: MatrixGroupState;
    collapsedByMode: MatrixGroupState;
    search: string;
    tagFilter: string;
    suiteFilter: string;
    /** Width in pixels of the sticky test-case title column. */
    testCaseColumnWidth: number;
};
export const manualOutcomes = ['Passed', 'Failed', 'Blocked', 'NotApplicable', 'Inconclusive'] as const;
export type ManualOutcome = typeof manualOutcomes[number];
export function emptyMatrixConfig(planId: number, catalogRootId: number): MatrixConfig {
    return { version: 3, planId, catalogRootId, grouping: 'environment', separateEnvironments: true, combinedMappings: {}, columns: [], mappings: {},
        groupOrderByMode: { environment: [], content: [] }, collapsedByMode: { environment: [], content: [] },
        search: '', tagFilter: '', suiteFilter: '', testCaseColumnWidth: DEFAULT_MATRIX_TITLE_COLUMN_WIDTH };
}
export function uniqueTags(value: string[]): string[] {
    const seen = new Set<string>();
    return value.map(t => t.trim()).filter(t => t && !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const string = (v: unknown): string => typeof v === 'string' ? v : '';
const strings = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : [];
const groupState = (v: unknown): MatrixGroupState => ({environment:record(v)?strings(v.environment):[],content:record(v)?strings(v.content):[]});
export function sanitizeMatrixTitleColumnWidth(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MATRIX_TITLE_COLUMN_WIDTH;
    return Math.min(MAX_MATRIX_TITLE_COLUMN_WIDTH, Math.max(MIN_MATRIX_TITLE_COLUMN_WIDTH, Math.round(value)));
}
/** Persist configuration only. Historical tags never imply a selected version ID. */
export function sanitizeMatrixConfig(raw: unknown): MatrixConfig | null {
    if (!record(raw) || !positive(raw.planId) || !positive(raw.catalogRootId)) return null;
    const legacy = raw.version !== 3;
    const columns = new Map<string, MatrixColumn>();
    if (!legacy && Array.isArray(raw.columns)) for (const c of raw.columns) {
        if (!record(c) || !string(c.id).trim() || columns.has(string(c.id))) continue;
        columns.set(string(c.id), {id:string(c.id),versionSuiteId:positive(c.versionSuiteId)?c.versionSuiteId:0,visible:c.visible!==false});
    }
    const mappings: Record<string, number> = {};
    if (!legacy && record(raw.mappings)) for (const [key,id] of Object.entries(raw.mappings))
        if (positive(id)) Object.defineProperty(mappings,key,{value:id,enumerable:true});
    const combinedMappings: Record<string, number> = {};
    if (!legacy && record(raw.combinedMappings)) for (const [key,id] of Object.entries(raw.combinedMappings))
        if (positive(id)) Object.defineProperty(combinedMappings,key,{value:id,enumerable:true});
    const migratedFrom = legacy ? (raw.version === 2 ? 2 : 1) : raw.migratedFrom;
    return { version:3, ...(migratedFrom===1||migratedFrom===2?{migratedFrom}:{}), planId:raw.planId,catalogRootId:raw.catalogRootId,
        grouping:!legacy&&raw.grouping==='content'?'content':'environment',columns:[...columns.values()],mappings,
        separateEnvironments:legacy||raw.separateEnvironments!==false,combinedMappings,
        groupOrderByMode:groupState(legacy?null:raw.groupOrderByMode),collapsedByMode:groupState(legacy?null:raw.collapsedByMode),
        search:string(raw.search),tagFilter:string(raw.tagFilter),suiteFilter:string(raw.suiteFilter),
        testCaseColumnWidth:sanitizeMatrixTitleColumnWidth(raw.testCaseColumnWidth)};
}
