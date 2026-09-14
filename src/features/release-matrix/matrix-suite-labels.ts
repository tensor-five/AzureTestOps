import type { TestSuiteFlatEntry } from '../../domain/test-management/test-suite-tree.js';

/** Disambiguates catalog sources without changing their names or matching identity. */
export function buildMatrixSuiteLabels(catalogSuites: readonly TestSuiteFlatEntry[], rootSuiteId: number): Map<number, string> {
    const byId = new Map(catalogSuites.map(suite => [suite.id, suite]));
    const nameCounts = new Map<string, number>();
    for (const suite of catalogSuites) nameCounts.set(suite.name, (nameCounts.get(suite.name) ?? 0) + 1);
    const labels = new Map<number, string>();
    for (const suite of catalogSuites) {
        const parts = [suite.name];
        if ((nameCounts.get(suite.name) ?? 0) > 1) {
            const visited = new Set([suite.id]);
            let parent = suite.parentSuiteId;
            while (parent !== null && parent !== rootSuiteId && !visited.has(parent)) {
                visited.add(parent);
                const ancestor = byId.get(parent);
                if (!ancestor) break;
                parts.unshift(ancestor.name);
                parent = ancestor.parentSuiteId;
            }
        }
        labels.set(suite.id, parts.join(' > '));
    }
    const labelCounts = new Map<string, number>();
    for (const label of labels.values()) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    for (const [id, label] of labels) {
        if ((labelCounts.get(label) ?? 0) > 1) labels.set(id, `${label} (#${id})`);
    }
    return labels;
}
