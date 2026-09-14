// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { matrixGroups } from './matrix-presentation.js';
import { MatrixTable } from './matrix-table.js';
import { combinedMappingKey } from './matrix-combined-sources.js';

afterEach(cleanup);
function fixture() {
    const { snapshot, config } = matrixHierarchyFixture();
    config.separateEnvironments = false;
    config.columns = [config.columns[1]];
    for (const suite of snapshot.suites) {
        const environment = snapshot.suites.find(candidate => candidate.id === suite.parentSuiteId);
        suite.path = `Plan > Version > ${environment?.name} > ${suite.name}`;
    }
    for (const projection of snapshot.projections) {
        projection.testPointId = projection.suiteId * 10;
        projection.lastOutcome = projection.suiteId === 25 ? 'Blocked' : 'Passed';
        snapshot.pointCounts[`${projection.suiteId}:${projection.workItemId}`] = 1;
    }
    return { snapshot, config };
}
describe('Combined source interactions', () => {
    it('distinguishes absent case membership from a missing content suite', () => {
        const { snapshot, config } = fixture();
        config.columns.unshift({ id: 'other', versionSuiteId: 30, visible: true });
        // Case 200 exists in Import in Version, but Outside has no Import suite.
        // Regression 100 stays in Outside while Version loses that case membership.
        snapshot.projections = snapshot.projections.filter(projection => projection.suiteId !== 22 && projection.suiteId !== 25);
        const view = render(<MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set()} update={vi.fn()} record={vi.fn()} onConfigure={vi.fn()} />);
        const absentMember = view.container.querySelector('[data-matrix-row=\'["Regression",100]\'] [data-matrix-column="catalog-version"]');
        const absentSuite = view.container.querySelector('[data-matrix-row=\'["Import",200]\'] [data-matrix-column="other"]');
        expect(absentMember?.textContent).toBe('·');
        expect(absentSuite?.textContent).toBe('?');
    });
    it('shows an explicit physical environment picker with no status before selection and never writes from choosing it', () => {
        const { snapshot, config } = fixture();
        const update = vi.fn(), record = vi.fn();
        const view = render(<MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set()} update={update} record={record} onConfigure={vi.fn()} />);
        const row = view.container.querySelector('[data-matrix-row=\'["Regression",100]\']')!;
        expect(within(row as HTMLElement).queryByRole('combobox', { name: /^Passed/ })).toBeNull();
        const picker = screen.getByRole('combobox', { name: 'Umgebung für Regression / #100 / Version' });
        expect(within(picker).getByRole('option', { name: /ACC · Plan > Version > ACC > Regression \(#25\)/ })).toBeTruthy();
        fireEvent.change(picker, { target: { value: '25' } });
        expect(update).toHaveBeenCalledWith({ combinedMappings: { '["Regression",100,"catalog-version"]': 25 } });
        expect(record).not.toHaveBeenCalled();
    });
    it('does not transfer a keyboard outcome draft when the physical source changes', () => {
        const { snapshot, config } = fixture();
        const key = combinedMappingKey({ content: 'Regression', workItemId: 100 }, 'catalog-version');
        config.combinedMappings = { [key]: 22 };
        const record = vi.fn();
        const props = { snapshot, config, groups: matrixGroups(snapshot, config), pending: new Set<string>(), update: vi.fn(), record, onConfigure: vi.fn() };
        const view = render(<MatrixTable {...props} />);
        const original = screen.getByRole('combobox', { name: /Passed.*TST > Regression.*Suite #22/ });
        fireEvent.keyDown(original, { key: 'ArrowDown' });
        expect(view.container.querySelector('[data-matrix-row=\'["Regression",100]\']')?.textContent).toContain('✗');
        view.rerender(<MatrixTable {...props} config={{ ...config, combinedMappings: { [key]: 25 } }} />);
        const replacement = screen.getByRole('combobox', { name: /Blocked.*ACC > Regression.*Suite #25/ });
        expect((replacement as HTMLSelectElement).value).toBe('Blocked');
        fireEvent.keyDown(replacement, { key: 'Enter' });
        expect(record).not.toHaveBeenCalled();
        fireEvent.change(replacement, { target: { value: 'ResetToActive' } });
        expect(record).toHaveBeenCalledWith({ contextIdentity: snapshot.contextIdentity, planId: 1, suiteId: 25, workItemId: 100, pointId: 250, outcome: 'ResetToActive' });
    });
    it('keeps invalid selections visible without falling back and lets the user explicitly clear them', () => {
        const { snapshot, config } = fixture();
        config.combinedMappings = { '["Regression",100,"catalog-version"]': 900 };
        snapshot.projections = snapshot.projections.filter(projection => projection.suiteId !== 25);
        const update = vi.fn();
        const view = render(<MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set()} update={update} record={vi.fn()} onConfigure={vi.fn()} />);
        const row = view.container.querySelector('[data-matrix-row=\'["Regression",100]\']')!;
        expect(row.textContent).toContain('Suite #900 · ungültig');
        expect(within(row as HTMLElement).queryByRole('combobox', { name: /^Passed/ })).toBeNull();
        fireEvent.change(screen.getByRole('combobox', { name: 'Umgebung für Regression / #100 / Version' }), { target: { value: '' } });
        expect(update).toHaveBeenCalledWith({ combinedMappings: {} });
    });
    it.each(['pending', 'stale', 'blocked', 'multiple points'])('preserves the physical status write guard for %s', guard => {
        const { snapshot, config } = fixture();
        config.combinedMappings = { '["Regression",100,"catalog-version"]': 25 };
        if (guard === 'multiple points') snapshot.pointCounts['25:100'] = 2;
        const record = vi.fn();
        render(<MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set(guard === 'pending' ? ['25:100'] : [])}
          stale={guard === 'stale'} blocked={new Set(guard === 'blocked' ? ['25:100'] : [])} update={vi.fn()} record={record} onConfigure={vi.fn()} />);
        const outcome = screen.getByRole('combobox', { name: /Blocked.*ACC > Regression.*Suite #25/ });
        expect((outcome as HTMLSelectElement).disabled).toBe(true);
        if (guard === 'pending' || guard === 'stale') expect((screen.getByRole('combobox', { name: 'Umgebung für Regression / #100 / Version' }) as HTMLSelectElement).disabled).toBe(true);
        expect(record).not.toHaveBeenCalled();
    });
});
