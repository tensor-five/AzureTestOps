import { describe, it, expect } from 'vitest';
import { emptyMatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import { catalogRows, matrixGroups, resolveSource, descendantIds } from './matrix-presentation.js';
const suite = (id: number, name: string, parentSuiteId: number | null) => ({ id, name, parentSuiteId, path: name, depth: 0, suiteType: 'StaticTestSuite', tags: id >= 20 ? ['v-test'] : [] });
const row = (suiteId: number, workItemId: number, title: string, tags: string[] = []): TestCaseProjection => ({ suiteId, workItemId, title, tags, suitePath: 'Catalog', state: 'Ready', workItemType: 'Test Case', assignedTo: null, areaPath: null, priority: null, relatedIds: [], testPointId: null, configurationId: null, configurationName: null, lastOutcome: 'NotRun', lastRunId: null, lastResultId: null, lastResultCompletedDate: null });
function fixture() {
    const snapshot: MatrixSnapshot = { contextIdentity: 'https://dev.azure.com/contract-org/contract-project', planId: 1, suites: [suite(10, 'Catalog', null), suite(11, 'Regression', 10), suite(12, 'Import', 10), suite(20, 'Release', null), suite(21, 'Regression', 20), suite(22, 'Regression', 20)], projections: [row(11, 100, 'CSV', ['Regression', 'Import']), row(12, 100, 'CSV', ['Regression', 'Import']), row(12, 200, 'Empty'), row(21, 100, 'CSV', ['Regression'])], pointCounts: {} };
    const column = { id: 'release', name: 'Version', environment: 'Test', rootSuiteId: 20, tag: 'v-test', visible: true };
    const config = { ...emptyMatrixConfig(1, 10), columns: [column] };
    return { snapshot, column, config };
}
describe('Matrix presentation preserves physical sources', () => {
    it('retains full catalog occurrences and duplicates only presentation in tag mode', () => {
        const { snapshot, config } = fixture();
        expect(catalogRows(snapshot, config).map(p => p.groupName)).toEqual(['Regression', 'Import', 'Import']);
        const groups = matrixGroups(snapshot, { ...config, grouping: 'tags', tags: ['Import', 'Regression'] });
        expect(groups.map(g => g.rows.length)).toEqual([2, 2, 1]);
        expect(groups[0].rows.map(p => p.groupName)).toEqual(['Import', 'Regression']);
    });
    it('filters direct membership by ID while retaining catalog occurrences', () => {
        const { snapshot, config } = fixture();
        expect(matrixGroups(snapshot, { ...config, suiteFilter: '21', tagFilter: 'regression', search: 'cSv' }).flatMap(g => g.rows).map(p => p.groupName)).toEqual(['Import', 'Regression']);
        expect(matrixGroups(snapshot, { ...config, suiteFilter: '20' })).toEqual([]);
    });
    it('requires an explicit suite on ambiguity and never replaces an invalid ID with a name match', () => {
        const { snapshot, config, column } = fixture();
        expect(resolveSource(snapshot, config, 'Regression', column).ambiguous).toBe(true);
        config.mappings = { [JSON.stringify(['Regression','release'])]: 21 };
        snapshot.suites.find(s => s.id === 21)!.name = 'Renamed';
        expect(resolveSource(snapshot, config, 'Regression', column).suite?.id).toBe(21);
        snapshot.suites.find(s => s.id === 21)!.tags = [];
        expect(resolveSource(snapshot, config, 'Regression', column).suite).toBeUndefined();
    });
    it('does not fuzzy-match names and safely traverses corrupt cycles', () => {
        const { snapshot, config, column } = fixture();
        snapshot.suites = snapshot.suites.filter(s => s.id !== 22);
        snapshot.suites.find(s => s.id === 21)!.name = 'Regression extra';
        expect(resolveSource(snapshot, config, 'Regression', column).suite).toBeUndefined();
        snapshot.suites.find(s => s.id === 10)!.parentSuiteId = 11;
        expect([...descendantIds(snapshot, 10)].sort()).toEqual([10, 11, 12]);
    });
    it('sorts equal titles by numeric ID and honors only suite order in suite mode', () => {
        const { snapshot, config } = fixture();
        snapshot.projections.push(row(11, 2, 'CSV'));
        config.groupOrder = ['Import', 'Regression'];
        const groups = matrixGroups(snapshot, config);
        expect(groups.map(g => g.id)).toEqual(['Import', 'Regression']);
        expect(groups[1].rows.map(p => p.workItemId)).toEqual([2, 100]);
    });
});
