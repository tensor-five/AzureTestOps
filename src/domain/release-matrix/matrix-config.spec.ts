import { describe, it, expect } from 'vitest';
import { emptyMatrixConfig, sanitizeMatrixConfig, uniqueTags } from './matrix-config.js';
describe('Matrix user configuration', () => {
    it('keeps first tag spelling and order while ignoring case and blank entries', () => {
        expect(uniqueTags([' Data Import ', 'Regression', 'DATA IMPORT', ''])).toEqual(['Data Import', 'Regression']);
    });
    it('persists only declared preferences and preserves source identities', () => {
        const config = { ...emptyMatrixConfig(1, 10), columns: [{ id: 'release', name: 'Version', environment: 'Test', tag: 'any-tag', rootSuiteId: 20, visible: false }], mappings: { '11:release': 21 }, pending: true, results: [{ lastOutcome: 'Passed' }] };
        const clean = sanitizeMatrixConfig(config)!;
        expect(clean.columns[0]).toEqual(config.columns[0]);
        expect(clean.mappings).toEqual(config.mappings);
        expect(clean).not.toHaveProperty('pending');
        expect(clean).not.toHaveProperty('results');
    });
    it('rejects incomplete scopes and removes malformed column and mapping entries', () => {
        expect(sanitizeMatrixConfig({ planId: 0, catalogRootId: 10 })).toBeNull();
        expect(sanitizeMatrixConfig(null)).toBeNull();
        const clean = sanitizeMatrixConfig({ ...emptyMatrixConfig(1, 10), columns: [null, { id: '' }, { id: 'a', rootSuiteId: -5 }, { id: 'a', name: 'duplicate' }], mappings: { bad: -1, valid: 42 } })!;
        expect(clean.columns).toHaveLength(1);
        expect(clean.columns[0].rootSuiteId).toBe(0);
        expect(clean.mappings).toEqual({ valid: 42 });
    });
});
