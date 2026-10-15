// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { matrixFlatHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { sanitizeMatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { MatrixSettings } from './matrix-settings.js';
import { MatrixTable } from './matrix-table.js';
import { matrixGroups } from './matrix-presentation.js';

afterEach(cleanup);
describe('Per-column environment level', () => {
    it('defaults old and new columns to enabled and toggles each column independently', () => {
        const {snapshot,config}=matrixFlatHierarchyFixture();
        const update=vi.fn();
        render(<MatrixSettings snapshot={snapshot} config={config} update={update}/>);
        const boxes=screen.getAllByRole<HTMLInputElement>('checkbox',{name:/Umgebungsebene vorhanden/});
        expect(boxes.map(box=>box.checked)).toEqual([true,true,false]);
        fireEvent.click(boxes[1]);
        expect(update).toHaveBeenLastCalledWith({columns:[config.columns[0],{...config.columns[1],hasEnvironmentLevel:false},config.columns[2]]});
        fireEvent.click(boxes[2]);
        expect(update).toHaveBeenLastCalledWith({columns:[config.columns[0],config.columns[1],{...config.columns[2],hasEnvironmentLevel:true}]});
        fireEvent.click(screen.getByRole('button',{name:'Spalte hinzufügen'}));
        const added=update.mock.calls.at(-1)![0].columns.at(-1);
        expect(added.hasEnvironmentLevel !== false).toBe(true);
    });
    it.each([true,false])('shows flat content and writes the exact physical point (separate environments: %s)', separateEnvironments=>{
        const {snapshot,config,flatColumn}=matrixFlatHierarchyFixture();
        config.columns=[flatColumn]; config.separateEnvironments=separateEnvironments;
        const record=vi.fn();
        function View() {
            const [value,setValue]=React.useState(config);
            return <><MatrixSettings snapshot={snapshot} config={value} update={patch=>setValue(sanitizeMatrixConfig({...value,...patch})!)}/>
                <MatrixTable snapshot={snapshot} config={value} groups={matrixGroups(snapshot,value)} pending={new Set()}
                    update={vi.fn()} record={record} onConfigure={vi.fn()}/></>;
        }
        const view=render(<View/>);
        const table=screen.getByRole('table',{name:'Release-Matrix'});
        const status=within(table).getByRole('combobox',{name:/Flat-only case.*Suite #61/});
        fireEvent.change(status,{target:{value:'Failed'}});
        expect(record).toHaveBeenCalledExactlyOnceWith({contextIdentity:'test-context',planId:1,suiteId:61,workItemId:300,pointId:61300,outcome:'Failed'});
        expect(within(table).queryByRole('rowheader',{name:'Too deep'})).toBeNull();
        fireEvent.click(screen.getByRole('checkbox',{name:'Umgebungsebene vorhanden für Spalte 1'}));
        expect(view.container.querySelector('[data-matrix-row]')?.textContent).toContain('Too deep');
        expect(within(table).queryByRole('combobox',{name:/Flat-only case/})).toBeNull();
        fireEvent.click(screen.getByRole('checkbox',{name:'Umgebungsebene vorhanden für Spalte 1'}));
        expect(within(table).getByRole('combobox',{name:/Flat-only case/})).toBeTruthy();
        expect(record).toHaveBeenCalledTimes(1);
    });
    it.each(['pending','blocked','multiple points','stale'])('preserves status write guards for a flat column: %s', guard=>{
        const {snapshot,config,flatColumn}=matrixFlatHierarchyFixture(); config.columns=[flatColumn];
        if (guard==='multiple points') snapshot.pointCounts['61:300']=2;
        render(<MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot,config)}
            pending={new Set(guard==='pending'?['61:300']:[])} blocked={new Set(guard==='blocked'?['61:300']:[])} stale={guard==='stale'}
            update={vi.fn()} record={vi.fn()} onConfigure={vi.fn()}/>);
        expect(screen.getByRole<HTMLSelectElement>('combobox',{name:/Flat-only case/}).disabled).toBe(true);
    });
});
