import { describe, expect, it } from 'vitest';
import type { TestSuiteFlatEntry } from '../../domain/test-management/test-suite-tree.js';
import { buildMatrixSuiteLabels } from './matrix-suite-labels.js';

const suite = (id: number, name: string, parentSuiteId: number | null): TestSuiteFlatEntry => ({ id, name, parentSuiteId, path: name, depth: 0 });
describe('Catalog source labels', () => {
    it('uses the entire relative catalog path for duplicate names while retaining unique names', () => {
        const labels = buildMatrixSuiteLabels([
            suite(10, 'Catalog', null), suite(11, 'A', 10), suite(12, 'B', 10), suite(13, 'Nested', 11),
            suite(21, 'Regression', 13), suite(22, 'Regression', 12), suite(23, 'Data Import', 13),
        ], 10);
        expect(labels.get(21)).toBe('A > Nested > Regression');
        expect(labels.get(22)).toBe('B > Regression');
        expect(labels.get(23)).toBe('Data Import');
    });
    it('adds physical suite IDs when the relative paths are identical', () => {
        const labels = buildMatrixSuiteLabels([
            suite(10, 'Catalog', null), suite(11, 'A', 10), suite(12, 'A', 10),
            suite(21, 'Regression', 11), suite(22, 'Regression', 12),
        ], 10);
        expect(labels.get(21)).toBe('A > Regression (#21)');
        expect(labels.get(22)).toBe('A > Regression (#22)');
    });
    it('terminates on malformed parent cycles', () => {
        const labels = buildMatrixSuiteLabels([suite(11, 'Regression', 12), suite(12, 'Regression', 11)], 10);
        expect(labels.get(11)).toBe('Regression > Regression (#11)');
        expect(labels.get(12)).toBe('Regression > Regression (#12)');
    });
});
