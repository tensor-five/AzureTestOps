import { describe, it, expect } from 'vitest';
import { matrixHierarchyFixture, matrixSuite, matrixProjection } from '../../../tests/fixtures/matrix-hierarchy.js';
import { catalogRows, matrixGroups, resolveSource, descendantIds, mappingKey, matrixRowKey, versionTitle } from './matrix-presentation.js';
const context={environment:'TST',content:'Regression'};
describe('Hierarchical matrix presentation',()=>{
    it('RM4-01 RM4-04 derives the union solely from visible valid version columns',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();
        snapshot.projections.push(matrixProjection(32,901),matrixProjection(42,902));
        expect(catalogRows(snapshot,{...config,columns:[column]}).map(matrixRowKey).sort()).toEqual(['["TST","Regression",100]','["TST","Regression",901]']);
        expect(catalogRows(snapshot,{...config,columns:[...config.columns,{id:'archive',versionSuiteId:40,visible:false}]}).map(row=>row.workItemId)).not.toContain(902);
        expect(catalogRows(snapshot,{...config,columns:config.columns.map(c=>({...c,visible:false}))})).toEqual([]);
        expect(catalogRows(snapshot,{...config,columns:[]})).toEqual([]);
        expect(catalogRows(snapshot,{...config,columns:[{...column,versionSuiteId:99999}]})).toEqual([]);
        expect(catalogRows(snapshot,{...config,planId:2})).toEqual([]);
    });
    it('RM4-02 walks forward from selected roots and excludes direct version, environment and deep memberships',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();
        snapshot.suites.push(matrixSuite(50,'Archive',1),matrixSuite(51,'Nested',32));
        snapshot.suites.find(s=>s.id===30)!.parentSuiteId=50;
        snapshot.projections.push(matrixProjection(30,900),matrixProjection(31,901),matrixProjection(51,902));
        expect(catalogRows(snapshot,{...config,columns:[column]}).map(matrixRowKey)).toEqual(['["TST","Regression",100]']);
    });
    it('RM4-06 ignores both smaller and obsolete catalog IDs without adding archived rows',()=>{
        const {snapshot,config}=matrixHierarchyFixture();
        snapshot.projections.push(matrixProjection(32,901),matrixProjection(42,902));
        const expected=catalogRows(snapshot,config).map(matrixRowKey).sort();
        expect(expected).toContain('["TST","Regression",901]');
        expect(expected).not.toContain('["TST","Regression",902]');
        for(const catalogRootId of [1,20,42,99999]) expect(catalogRows(snapshot,{...config,catalogRootId}).map(matrixRowKey).sort()).toEqual(expected);
    });
    it('deduplicates across versions while preserving different environments and contents',()=>{
        const {snapshot,config}=matrixHierarchyFixture();
        expect(catalogRows(snapshot,config).map(matrixRowKey).sort()).toEqual(['["TST","Regression",100]','["TST","Import",100]','["TST","Import",200]','["ACC","Regression",100]'].sort());
        expect(matrixGroups(snapshot,config).map(g=>[g.name,g.rows.length])).toEqual([['ACC',1],['TST',3]]);
        expect(matrixGroups(snapshot,{...config,grouping:'content'}).map(g=>[g.name,g.rows.length])).toEqual([['Import',2],['Regression',2]]);
    });
    it('uses direct membership and full normalized case tags without changing sources',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();
        const filtered={...config,suiteFilter:'32',tagFilter:' regression ',search:'cSv'};
        expect(matrixGroups(snapshot,filtered).flatMap(g=>g.rows)).toHaveLength(3);
        expect(matrixGroups(snapshot,{...config,suiteFilter:'30'})).toEqual([]);
        expect(matrixGroups(snapshot,{...config,tagFilter:'Regress'})).toEqual([]);
        expect(resolveSource(snapshot,filtered,context,column).suite?.id).toBe(32);
    });
    it('resolves only direct children under the selected version',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();
        expect(resolveSource(snapshot,config,context,column).suite?.id).toBe(32);
        snapshot.suites.push(matrixSuite(50,'Wrapper',31));snapshot.suites.find(s=>s.id===32)!.parentSuiteId=50;
        expect(resolveSource(snapshot,config,context,column).reason).toContain('Inhaltliche Suite fehlt');
        snapshot.suites.find(s=>s.id===31)!.parentSuiteId=10;
        expect(resolveSource(snapshot,config,context,column).reason).toContain('Umgebungs-Suite fehlt');
    });
    it.each([[31,'tst'],[32,'regression'],[32,'Regression extra']] as const)('uses exact complete names for %s', (id,name)=>{
        const {snapshot,config,column}=matrixHierarchyFixture();snapshot.suites.find(s=>s.id===id)!.name=name;
        expect(resolveSource(snapshot,config,context,column).suite).toBeUndefined();
    });
    it('requires concrete selection on duplicate paths and never substitutes invalid saved mappings',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();snapshot.suites.push(matrixSuite(33,'Regression',31));
        expect(resolveSource(snapshot,config,context,column).ambiguous).toBe(true);
        config.mappings[mappingKey(context,column.id)]=33;
        expect(resolveSource(snapshot,config,context,column).suite?.id).toBe(33);
        snapshot.suites.find(s=>s.id===33)!.parentSuiteId=21;
        expect(resolveSource(snapshot,config,context,column).suite).toBeUndefined();
        expect(resolveSource(snapshot,config,context,column).reason).toContain('ungültig');
    });
    it('deduplicates physical records before detecting ambiguity and preserves version identity through rename',()=>{
        const {snapshot,config,column}=matrixHierarchyFixture();snapshot.suites.push({...snapshot.suites.find(s=>s.id===32)!});
        expect(resolveSource(snapshot,config,context,column).candidates).toHaveLength(1);
        snapshot.suites.find(s=>s.id===30)!.name='Renamed version';
        expect(versionTitle(snapshot,column)).toBe('Renamed version');
        expect(resolveSource(snapshot,config,context,column).suite?.id).toBe(32);
        expect(resolveSource(snapshot,{...config,planId:2},context,column).suite).toBeUndefined();
        expect(resolveSource(snapshot,config,context,{...column,versionSuiteId:0}).reason).toContain('auswählen');
        snapshot.suites=snapshot.suites.filter(s=>s.id!==30);
        expect(versionTitle(snapshot,column)).toContain('ungültig');
        expect(resolveSource(snapshot,config,context,column).reason).toContain('ungültig');
    });
    it('retains separate grouping orders and sorts equal titles by numeric case ID',()=>{
        const {snapshot,config}=matrixHierarchyFixture();snapshot.projections.push(matrixProjection(22,2));
        config.groupOrderByMode.environment=['TST','ACC'];config.groupOrderByMode.content=['Regression','Import'];
        const groups=matrixGroups(snapshot,config);expect(groups.map(g=>g.id)).toEqual(['TST','ACC']);
        expect(groups[0].rows.map(r=>r.workItemId)).toEqual([2,100,100,200]);
        expect(matrixGroups(snapshot,{...config,grouping:'content'}).map(g=>g.id)).toEqual(['Regression','Import']);
    });
    it('handles incomplete ancestor chains and protects traversal against cycles',()=>{
        const {snapshot,config}=matrixHierarchyFixture();snapshot.projections.push(matrixProjection(1,300));
        expect(catalogRows(snapshot,config)).toHaveLength(4);
        snapshot.suites.find(s=>s.id===10)!.parentSuiteId=22;
        expect(descendantIds(snapshot,10).size).toBe(10);
    });
});
