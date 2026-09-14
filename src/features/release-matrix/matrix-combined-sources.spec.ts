import { describe, expect, it } from 'vitest';
import { matrixHierarchyFixture, matrixProjection, matrixSuite } from '../../../tests/fixtures/matrix-hierarchy.js';
import { combinedMappingKey, createCombinedSourceResolver } from './matrix-combined-sources.js';
import { catalogRows, effectiveMatrixGrouping, matrixGroups, matrixRowKey } from './matrix-presentation.js';

const row = { content: 'Regression', workItemId: 100 };
describe('Combined matrix environments', () => {
    it('unifies content and case only across visible versions while keeping physical projections untouched', () => {
        const { snapshot, config } = matrixHierarchyFixture();
        config.separateEnvironments = false;
        snapshot.projections.push(matrixProjection(42, 901), matrixProjection(22, 200));
        const original = structuredClone(snapshot);
        expect(catalogRows(snapshot, config).map(matrixRowKey).sort()).toEqual(['["Import",100]', '["Import",200]', '["Regression",100]', '["Regression",200]']);
        const groups = matrixGroups(snapshot, config);
        expect(groups.map(group => group.name)).toEqual(['Import', 'Regression']);
        expect(effectiveMatrixGrouping(config)).toBe('content');
        expect(config.grouping).toBe('environment');
        expect(snapshot).toEqual(original);
        expect(catalogRows(snapshot, { ...config, columns: config.columns.map(column => ({ ...column, visible: false })) })).toEqual([]);
    });
    it('resolves uniquely by direct physical case membership per version', () => {
        const { snapshot, config, column } = matrixHierarchyFixture();
        const resolve = createCombinedSourceResolver(snapshot, config);
        expect(resolve(row, column).suite?.id).toBe(32);
        expect(resolve(row, config.columns[1])).toMatchObject({ suite: undefined, ambiguous: true });
        expect(resolve(row, config.columns[1]).candidates.map(suite => suite.id)).toEqual([22, 25]);
        // Same content exists in two environments, but only this case has a second source.
        snapshot.projections.push(matrixProjection(25, 200));
        expect(createCombinedSourceResolver(snapshot, config)({ ...row, workItemId: 200 }, config.columns[1]).suite?.id).toBe(25);
        expect(createCombinedSourceResolver(snapshot, config)({ ...row, workItemId: 999 }, config.columns[1])).toMatchObject({ suite: undefined, ambiguous: false });
    });
    it('requires a per-case choice even for duplicate paths in the same named environment', () => {
        const { snapshot, config, column } = matrixHierarchyFixture();
        snapshot.suites.push(matrixSuite(33, 'Regression', 31), { ...snapshot.suites.find(suite => suite.id === 32)! });
        snapshot.projections.push(matrixProjection(33, 100), matrixProjection(33, 200));
        let resolve = createCombinedSourceResolver(snapshot, config);
        expect(resolve(row, column).candidates.map(suite => suite.id)).toEqual([32, 33]);
        expect(resolve(row, column).ambiguous).toBe(true);
        config.combinedMappings = { [combinedMappingKey(row, column.id)]: 33 };
        config.mappings = { '["TST","Regression","release"]': 32 };
        resolve = createCombinedSourceResolver(snapshot, config);
        expect(resolve(row, column).suite?.id).toBe(33);
        expect(resolve({ ...row, workItemId: 200 }, column).suite?.id).toBe(33);
        expect(config.mappings).toEqual({ '["TST","Regression","release"]': 32 });
        // Adding a second source for the other case must not reuse the first case's choice.
        snapshot.projections.push(matrixProjection(32, 200));
        expect(createCombinedSourceResolver(snapshot, config)({ ...row, workItemId: 200 }, column).ambiguous).toBe(true);
    });
    it.each(['membership', 'parent', 'version', 'plan'])('blocks invalid saved sources after %s changes without choosing the remaining source', change => {
        const { snapshot, config } = matrixHierarchyFixture();
        const column = config.columns[1];
        config.combinedMappings = { [combinedMappingKey(row, column.id)]: 25 };
        if (change === 'membership') snapshot.projections = snapshot.projections.filter(projection => projection.suiteId !== 25);
        if (change === 'parent') snapshot.suites.find(suite => suite.id === 25)!.parentSuiteId = 31;
        if (change === 'version') column.versionSuiteId = 30;
        if (change === 'plan') config.planId = 999;
        const source = createCombinedSourceResolver(snapshot, config)(row, column);
        expect(source.suite).toBeUndefined();
        expect(source.reason).toContain('ungültig');
    });
    it('never descends through wrappers or substitutes partial content names', () => {
        const { snapshot, config, column } = matrixHierarchyFixture();
        snapshot.suites.push(matrixSuite(50, 'Wrapper', 31));
        snapshot.suites.find(suite => suite.id === 32)!.parentSuiteId = 50;
        expect(createCombinedSourceResolver(snapshot, config)(row, column).suite).toBeUndefined();
        snapshot.suites.find(suite => suite.id === 32)!.parentSuiteId = 31;
        snapshot.suites.find(suite => suite.id === 32)!.name = 'Regression additional';
        expect(createCombinedSourceResolver(snapshot, config)(row, column).suite).toBeUndefined();
        expect(createCombinedSourceResolver(snapshot, config)(row, { ...column, versionSuiteId: 0 }).suite).toBeUndefined();
    });
    it('preserves tag, membership and search filters and the separate view grouping state', () => {
        const { snapshot, config } = matrixHierarchyFixture();
        config.separateEnvironments = false;
        config.groupOrderByMode = { environment: ['TST', 'ACC'], content: ['Regression', 'Import'] };
        config.collapsedByMode = { environment: ['ACC'], content: [] };
        const filtered = { ...config, search: 'CSV', tagFilter: ' regression ', suiteFilter: '32' };
        expect(matrixGroups(snapshot, filtered).map(group => [group.name, group.rows.length])).toEqual([['Regression', 1], ['Import', 1]]);
        expect(matrixGroups(snapshot, { ...config, separateEnvironments: true }).map(group => group.name)).toEqual(['TST', 'ACC']);
        expect(config.collapsedByMode.environment).toEqual(['ACC']);
    });
});
