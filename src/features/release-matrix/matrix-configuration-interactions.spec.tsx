// @vitest-environment jsdom
import * as React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {matrixHierarchyFixture,matrixSuite,matrixProjection} from '../../../tests/fixtures/matrix-hierarchy.js';
import {sanitizeMatrixConfig,type MatrixConfig} from '../../domain/release-matrix/matrix-config.js';
import {matrixGroups} from './matrix-presentation.js';
import {MatrixTable} from './matrix-table.js';
import {MatrixSettings} from './matrix-settings.js';
afterEach(cleanup);
describe('Matrix hierarchy configuration interactions',()=>{
    it('keeps equal environment and content names independently collapsed',()=>{
        const {snapshot,config}=matrixHierarchyFixture();
        for(const suite of snapshot.suites)if(suite.name==='Regression')suite.name='TST';
        function StatefulTable(){const [value,setValue]=React.useState<MatrixConfig>(config);return <>
            <button onClick={()=>setValue(v=>({...v,grouping:v.grouping==='environment'?'content':'environment'}))}>Modus wechseln</button>
            <MatrixTable snapshot={snapshot} config={value} groups={matrixGroups(snapshot,value)} pending={new Set()} update={patch=>setValue(v=>sanitizeMatrixConfig({...v,...patch})!)} record={vi.fn()} onConfigure={vi.fn()}/>
        </>;}
        render(<StatefulTable/>);const switchMode=()=>fireEvent.click(screen.getByRole('button',{name:'Modus wechseln'}));
        fireEvent.click(screen.getByRole('button',{name:'Gruppe TST einklappen'}));switchMode();
        fireEvent.click(screen.getByRole('button',{name:'Gruppe TST einklappen'}));switchMode();
        fireEvent.click(screen.getByRole('button',{name:'Gruppe TST aufklappen'}));switchMode();
        fireEvent.click(screen.getByRole('button',{name:'Gruppe TST aufklappen'}));switchMode();
        expect(screen.getByRole('button',{name:'Gruppe TST einklappen'}).getAttribute('aria-expanded')).toBe('true');
    });
    it('moves visible groups without losing filtered groups or the other grouping order',()=>{
        const {snapshot,config}=matrixHierarchyFixture();snapshot.suites.find(s=>s.id===24)!.name='PRD';
        snapshot.suites.push(matrixSuite(60,'ACC',20),matrixSuite(61,'Regression',60));snapshot.projections.push(matrixProjection(61,300));
        config.groupOrderByMode={environment:['TST','ACC','PRD'],content:['Regression','Import']};
        config.tagFilter='Visible';snapshot.projections=snapshot.projections.map(p=>({...p,tags:[p.suiteId===61?'Hidden':'Visible']}));
        const groups=matrixGroups(snapshot,config),update=vi.fn();
        render(<MatrixTable snapshot={snapshot} config={config} groups={groups} pending={new Set()} update={update} record={vi.fn()} onConfigure={vi.fn()}/>);
        fireEvent.click(screen.getByRole('button',{name:'Gruppe PRD nach oben'}));
        expect(update).toHaveBeenCalledWith({groupOrderByMode:{environment:['PRD','ACC','TST'],content:['Regression','Import']}});
    });
    it.each([false,true])('shows physical candidate paths and IDs, including equal paths (%s)',identicalPaths=>{
        const {snapshot,config}=matrixHierarchyFixture();
        Object.assign(snapshot.suites.find(s=>s.id===32)!,{path:'Plan > Outside > TST > Regression'});
        snapshot.suites.push({...matrixSuite(33,'Regression',31),path:identicalPaths?'Plan > Outside > TST > Regression':'Plan > Alternate > TST > Regression'});
        const update=vi.fn();render(<MatrixSettings snapshot={snapshot} config={config} update={update}/>);
        const select=screen.getByRole('combobox',{name:'Suite für TST / Regression / Outside'});
        expect(select.textContent).toContain('Plan > Outside > TST > Regression (#32)');
        expect(select.textContent).toContain(`Plan > ${identicalPaths?'Outside':'Alternate'} > TST > Regression (#33)`);
        fireEvent.change(select,{target:{value:'33'}});
        expect(update).toHaveBeenLastCalledWith({mappings:{'["TST","Regression","release"]':33}});
        fireEvent.change(select,{target:{value:''}});expect(update).toHaveBeenLastCalledWith({mappings:{}});
    });
    it('keeps invalid version choices visible and adds unconfigured columns without guessing a version',()=>{
        const {snapshot,config}=matrixHierarchyFixture();config.columns[0].versionSuiteId=900;
        const update=vi.fn();render(<MatrixSettings snapshot={snapshot} config={config} update={update}/>);
        expect(screen.getByRole('combobox',{name:'Versions-Suite 1'}).textContent).toContain('#900 · ungültig');
        fireEvent.click(screen.getByRole('button',{name:'Spalte hinzufügen'}));
        expect(update).toHaveBeenLastCalledWith({columns:[...config.columns,expect.objectContaining({versionSuiteId:0,visible:true})]});
    });
});
