import type { MatrixColumn } from './matrix-config.js';

type Suite = { id: number; name: string; parentSuiteId: number | null };
/** Index direct parent relationships once; a missing flag retains the environment level. */
export function createMatrixColumnHierarchy<T extends Suite>(entries: readonly T[]) {
    const suites = new Map(entries.map(suite => [suite.id, suite]));
    const children = new Map<number, T[]>();
    for (const suite of suites.values()) if (suite.parentSuiteId !== null) {
        const siblings = children.get(suite.parentSuiteId) ?? [];
        siblings.push(suite);
        children.set(suite.parentSuiteId, siblings);
    }
    const cache = new Map<string, { version: T | undefined; contents: Array<{ suite: T; environment: string }> }>();
    return (column: Pick<MatrixColumn, 'versionSuiteId' | 'hasEnvironmentLevel'>) => {
        const key = `${column.versionSuiteId}:${column.hasEnvironmentLevel !== false}`;
        const cached = cache.get(key);
        if (cached) return cached;
        const version = suites.get(column.versionSuiteId);
        const direct = version ? children.get(version.id) ?? [] : [];
        const contents = column.hasEnvironmentLevel === false
            ? direct.map(suite => ({ suite, environment: '' }))
            : direct.flatMap(environment => (children.get(environment.id) ?? []).map(suite => ({ suite, environment: environment.name })));
        const result = { version, contents };
        cache.set(key, result);
        return result;
    };
}
