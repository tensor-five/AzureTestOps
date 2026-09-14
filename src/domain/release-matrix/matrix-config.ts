export type MatrixColumn = {
    id: string;
    name: string;
    environment: string;
    tag: string;
    /** Legacy input only; v2 source selection never reads or persists this value. */
    rootSuiteId?: number;
    visible: boolean;
};
export type MatrixConfig = {
    version: 2;
    /** Durable configuration provenance: preserves the migration explanation through repeated sanitization. */
    migratedFrom?: 1;
    planId: number;
    catalogRootId: number;
    grouping: 'suites' | 'tags';
    tags: string[];
    columns: MatrixColumn[];
    mappings: Record<string, number>;
    groupOrder: string[];
    collapsed: string[];
    /** Tag-group IDs have their own namespace; suite names are unrestricted. */
    collapsedTags?: string[];
    search: string;
    tagFilter: string;
    suiteFilter: string;
};
export const manualOutcomes = ['Passed', 'Failed', 'Blocked', 'NotApplicable', 'Inconclusive'] as const;
export type ManualOutcome = typeof manualOutcomes[number];
export function emptyMatrixConfig(planId: number, catalogRootId: number): MatrixConfig {
    return { version: 2, planId, catalogRootId, grouping: 'suites', tags: [], columns: [], mappings: {}, groupOrder: [], collapsed: [], collapsedTags: [], search: '', tagFilter: '', suiteFilter: '' };
}
export function uniqueTags(value: string[]): string[] {
    const seen = new Set<string>();
    return value.map(t => t.trim()).filter(t => t && !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const string = (v: unknown): string => typeof v === 'string' ? v : '';
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
/** Persist only user configuration, never runtime projections or mutation state. */
export function sanitizeMatrixConfig(raw: unknown): MatrixConfig | null {
    if (!record(raw) || !positive(raw.planId) || !positive(raw.catalogRootId))
        return null;
    const columns = new Map<string, MatrixColumn>();
    if (Array.isArray(raw.columns))
        for (const c of raw.columns) {
            if (!record(c) || !string(c.id).trim() || columns.has(string(c.id)))
                continue;
            columns.set(string(c.id), { id: string(c.id), name: string(c.name), environment: string(c.environment), tag: string(c.tag), visible: c.visible !== false });
        }
    const mappings: Record<string, number> = {};
    const legacy = raw.version !== 2;
    if (!legacy && record(raw.mappings))
        for (const [key, id] of Object.entries(raw.mappings))
            if (positive(id))
                Object.defineProperty(mappings, key, { value: id, enumerable: true });
    return { version: 2, ...(legacy || raw.migratedFrom === 1 ? { migratedFrom: 1 as const } : {}), planId: raw.planId, catalogRootId: raw.catalogRootId, grouping: raw.grouping === 'tags' ? 'tags' : 'suites', tags: uniqueTags(strings(raw.tags)), columns: [...columns.values()], mappings, groupOrder: legacy ? [] : strings(raw.groupOrder), collapsed: legacy ? [] : strings(raw.collapsed), collapsedTags: legacy ? [] : strings(raw.collapsedTags), search: string(raw.search), tagFilter: string(raw.tagFilter), suiteFilter: string(raw.suiteFilter) };
}
