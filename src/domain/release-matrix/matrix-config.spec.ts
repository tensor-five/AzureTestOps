import {describe,it,expect} from 'vitest';
import {emptyMatrixConfig,sanitizeMatrixConfig,uniqueTags} from './matrix-config.js';
describe('Matrix v3 user configuration',()=>{
    it('normalizes test-case filter tag lists preserving first spelling',()=>{
        expect(uniqueTags([' Import ','Smoke','IMPORT',''])).toEqual(['Import','Smoke']);
    });
    it('persists only declared configuration with stable version and mapping IDs',()=>{
        const raw={...emptyMatrixConfig(1,10),columns:[{id:'a',versionSuiteId:20,visible:false,name:'Old',tag:'Ignored'}],mappings:{'["TST","Regression","a"]':22},pending:true,results:[{}]};
        const clean=sanitizeMatrixConfig(raw)!;
        expect(clean.columns).toEqual([{id:'a',versionSuiteId:20,visible:false}]);expect(clean.mappings).toEqual(raw.mappings);
        expect(clean).not.toHaveProperty('pending');expect(clean).not.toHaveProperty('results');
    });
    it('rejects incomplete scopes and sanitizes malformed columns, modes and mappings',()=>{
        expect(sanitizeMatrixConfig(null)).toBeNull();expect(sanitizeMatrixConfig({planId:0,catalogRootId:10})).toBeNull();
        const clean=sanitizeMatrixConfig({...emptyMatrixConfig(1,10),columns:[null,{id:''},{id:'a',versionSuiteId:-3},{id:'a',versionSuiteId:40}],mappings:{bad:-1,valid:22},groupOrderByMode:{environment:['TST',3,'TST']}})!;
        expect(clean.columns).toEqual([{id:'a',versionSuiteId:0,visible:true}]);expect(clean.mappings).toEqual({valid:22});
        expect(clean.groupOrderByMode).toEqual({environment:['TST'],content:[]});
    });
    it.each([1,2])('resets legacy v%s source/tag state once while retaining scope and filters',version=>{
        let clean=sanitizeMatrixConfig({version,planId:1,catalogRootId:10,grouping:'tags',tags:['Regression'],columns:[{id:'old',name:'2.1.0',tag:'Test'}],mappings:{old:22},groupOrder:['Regression'],collapsedTags:['tag:regression'],search:'201',tagFilter:'Regression',suiteFilter:'32'})!;
        expect(clean).toEqual({...emptyMatrixConfig(1,10),migratedFrom:version,search:'201',tagFilter:'Regression',suiteFilter:'32'});
        clean.columns=[{id:'new',versionSuiteId:20,visible:true}];clean.grouping='content';clean.collapsedByMode.content=['Regression'];
        const expected=structuredClone(clean);for(let pass=0;pass<5;pass++)clean=sanitizeMatrixConfig(clean)!;
        expect(clean).toEqual(expected);
    });
    it('keeps same-name groups independent in both modes through sanitization',()=>{
        const clean=sanitizeMatrixConfig({...emptyMatrixConfig(1,10),collapsedByMode:{environment:['TST'],content:['TST',null]},groupOrderByMode:{environment:['TST','ACC'],content:['Import','TST']}})!;
        expect(clean.collapsedByMode).toEqual({environment:['TST'],content:['TST']});expect(sanitizeMatrixConfig(clean)).toEqual(clean);
    });
});
