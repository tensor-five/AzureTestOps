import { describe, it, expect } from 'vitest';
import { emptyMatrixConfig, sanitizeMatrixConfig, uniqueTags } from './matrix-config.js';
describe('Matrix user configuration', () => {
    it('keeps first tag spelling and order while ignoring case and blank entries', () => {
        expect(uniqueTags([' Data Import ', 'Regression', 'DATA IMPORT', ''])).toEqual(['Data Import', 'Regression']);
    });
    it('persists only declared preferences and preserves source identities', () => {
        const config = { ...emptyMatrixConfig(1, 10), columns: [{ id: 'release', name: 'Version', environment: 'Test', tag: 'any-tag', rootSuiteId: 20, visible: false }], mappings: { '11:release': 21 }, pending: true, results: [{ lastOutcome: 'Passed' }] };
        const clean = sanitizeMatrixConfig(config)!;
        expect(clean.columns[0]).toEqual({ id: 'release', name: 'Version', environment: 'Test', tag: 'any-tag', visible: false });
        expect(clean.columns[0]).not.toHaveProperty('rootSuiteId');
        expect(clean.mappings).toEqual(config.mappings);
        expect(clean).not.toHaveProperty('pending');
        expect(clean).not.toHaveProperty('results');
    });
    it('rejects incomplete scopes and removes malformed column and mapping entries', () => {
        expect(sanitizeMatrixConfig({ planId: 0, catalogRootId: 10 })).toBeNull();
        expect(sanitizeMatrixConfig(null)).toBeNull();
        const clean = sanitizeMatrixConfig({ ...emptyMatrixConfig(1, 10), columns: [null, { id: '' }, { id: 'a', rootSuiteId: -5 }, { id: 'a', name: 'duplicate' }], mappings: { bad: -1, valid: 42 } })!;
        expect(clean.columns).toHaveLength(1);
        expect(clean.columns[0]).not.toHaveProperty('rootSuiteId');
        expect(clean.mappings).toEqual({ valid: 42 });
    });
    it('migrates v1 exactly once and preserves provenance through repeated server/UI sanitization', () => {
        const raw = { ...emptyMatrixConfig(1,10), version: undefined, grouping: 'tags', tags:[' Data Import '],
            columns:[{id:'test',name:'Release',environment:'Test',tag:'2.1.0-Test',rootSuiteId:40,visible:false}],
            mappings:{'11:test':43},groupOrder:['11','12'],collapsed:['11'],search:'CSV',tagFilter:'Regression',suiteFilter:'21' };
        let clean = sanitizeMatrixConfig(raw)!;
        expect(clean).toMatchObject({version:2,migratedFrom:1,catalogRootId:10,grouping:'tags',tags:['Data Import'],
            mappings:{},groupOrder:[],collapsed:[],search:'CSV',tagFilter:'Regression',suiteFilter:'21'});
        expect(clean.columns[0]).toMatchObject({name:'Release',environment:'Test',tag:'2.1.0-Test',visible:false});
        clean.mappings[JSON.stringify(['Regression','test'])]=21;clean.groupOrder=['Regression'];clean.collapsed=['Regression'];
        const expected=structuredClone(clean);
        for(let pass=0;pass<5;pass++)clean=sanitizeMatrixConfig(clean)!;
        expect(clean).toEqual(expected);
    });

    it('preserves separate suite and tag collapse states through repeated sanitization', () => {
        const raw = { ...emptyMatrixConfig(1, 10), collapsed: ['untagged', 'tag:smoke'], collapsedTags: ['tag:smoke', 42, null] };
        const clean = sanitizeMatrixConfig(raw)!;
        expect(clean.collapsed).toEqual(['untagged', 'tag:smoke']);
        expect(clean.collapsedTags).toEqual(['tag:smoke']);
        expect(sanitizeMatrixConfig(clean)).toEqual(clean);
        expect(sanitizeMatrixConfig({ ...raw, collapsedTags: undefined })!.collapsedTags).toEqual([]);
        expect(sanitizeMatrixConfig({ ...raw, version: 1 })!.collapsedTags).toEqual([]);
    });

});
