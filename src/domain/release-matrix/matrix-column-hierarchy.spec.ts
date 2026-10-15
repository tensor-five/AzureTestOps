import { describe, expect, it } from 'vitest';
import { matrixFlatHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { createMatrixColumnHierarchy } from './matrix-column-hierarchy.js';

describe('Column-specific content hierarchy', () => {
    it('defaults to direct environment children and accepts an explicit enabled flag', () => {
        const {snapshot,config} = matrixFlatHierarchyFixture();
        const hierarchy = createMatrixColumnHierarchy(snapshot.suites);
        const column = config.columns[1];
        expect(hierarchy(column).contents.map(entry => [entry.suite.id,entry.environment])).toEqual([
            [22,'TST'],[23,'TST'],[25,'ACC']]);
        expect(hierarchy({...column,hasEnvironmentLevel:true})).toEqual(hierarchy(column));
    });
    it('selects direct content children without descending through another level', () => {
        const {snapshot,flatColumn} = matrixFlatHierarchyFixture();
        const hierarchy = createMatrixColumnHierarchy(snapshot.suites);
        expect(hierarchy(flatColumn).contents.map(entry => [entry.suite.id,entry.environment])).toEqual([[61,''],[62,'']]);
        expect(hierarchy({...flatColumn,hasEnvironmentLevel:true}).contents.map(entry => entry.suite.id)).toEqual([63]);
        expect(hierarchy({...flatColumn,versionSuiteId:99999}).contents).toEqual([]);
    });
});
