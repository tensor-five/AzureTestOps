// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import { MatrixCell } from './matrix-cell.js';
import { MatrixTooltipProvider } from './matrix-tooltip.js';

afterEach(cleanup);

function projection(outcome: string, title = 'Import prüfen'): TestCaseProjection {
    return {
        workItemId: 201, suiteId: 21, suitePath: 'Release / Regression', title,
        state: 'Ready', workItemType: 'Test Case', assignedTo: null, tags: [],
        areaPath: null, priority: null, relatedIds: [], testPointId: 21201,
        configurationId: 1, configurationName: 'Default', lastOutcome: outcome,
        lastResultId: 1000, lastResultCompletedDate: null, lastRunId: 100,
    };
}

const defaults = {
    pointCount: 1, pending: false, missingSuite: false, ambiguous: false,
    onConfigure: vi.fn(), onChange: vi.fn(),
};

function cell(outcome: string, key = 'import', title = 'Import prüfen') {
    return <MatrixCell key={key} {...defaults} projection={projection(outcome, title)} />;
}

describe('Matrix outcome tooltip', () => {
    it('locks a stale value and explains the required refresh without pretending it is a pending write', () => {
        render(<MatrixTooltipProvider><MatrixCell {...defaults} projection={projection('Failed')}
            readOnlyReason="Angezeigter Stand veraltet. Bitte die Matrix aktualisieren." /></MatrixTooltipProvider>);
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.disabled).toBe(true);
        expect(select.value).toBe('Failed');
        expect(select.parentElement?.getAttribute('aria-busy')).toBe('false');
        fireEvent.mouseEnter(select.parentElement!);
        expect(screen.getByRole('tooltip').textContent).toContain('veraltet');
    });
    it('keeps a tapped description through compatibility mouseleave and dismisses it on the next outside tap', () => {
        render(<MatrixTooltipProvider><MatrixCell {...defaults} /><button type="button">Outside</button></MatrixTooltipProvider>);
        const button = screen.getByRole('button', { name: 'Nicht in dieser Suite' });
        const touch = new Event('pointerdown', { bubbles: true });
        Object.defineProperty(touch, 'pointerType', { value: 'touch' });
        fireEvent(button, touch);
        fireEvent.click(button);
        fireEvent.mouseLeave(button.parentElement!);
        expect(screen.getByRole('tooltip').textContent).toBe('Nicht in dieser Suite');
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('keeps the description of a focused cell when the mouse leaves it', () => {
        render(<MatrixTooltipProvider>{cell('Failed')}<button type="button">Outside</button></MatrixTooltipProvider>);
        const select = screen.getByRole('combobox');
        act(() => select.focus());
        fireEvent.mouseLeave(select.parentElement!);
        expect(screen.getByRole('tooltip').textContent).toContain('Failed');
        act(() => screen.getByRole('button', { name: 'Outside' }).focus());
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it.each(['hover', 'focus'] as const)('updates an already visible tooltip after confirmation (%s)', interaction => {
        const { rerender } = render(<MatrixTooltipProvider>{cell('Failed')}</MatrixTooltipProvider>);
        const select = screen.getByRole('combobox');
        if (interaction === 'hover') fireEvent.mouseEnter(select.parentElement!);
        else fireEvent.focus(select);
        expect(screen.getByRole('tooltip').textContent).toContain('Failed');

        rerender(<MatrixTooltipProvider>{cell('Passed')}</MatrixTooltipProvider>);

        expect(screen.getByRole('tooltip').textContent).toBe('Passed · Import prüfen · Release / Regression');
        expect(select.getAttribute('aria-label')).toBe(screen.getByRole('tooltip').textContent);
        expect(select.parentElement!.querySelector('.relations-view-outcome-chip')?.textContent).toBe('✓');
        expect(select.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    });

    it('removes the tooltip when filtering or collapsing removes its cell without a mouseleave', () => {
        const { rerender } = render(<MatrixTooltipProvider>{cell('Failed')}</MatrixTooltipProvider>);
        fireEvent.mouseEnter(screen.getByRole('combobox').parentElement!);
        expect(screen.getByRole('tooltip')).toBeTruthy();

        rerender(<MatrixTooltipProvider>{null}</MatrixTooltipProvider>);

        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('keeps the current cell tooltip when another cell changes or is removed', () => {
        const { rerender } = render(<MatrixTooltipProvider>{cell('Failed')}{cell('Blocked', 'export', 'Export prüfen')}</MatrixTooltipProvider>);
        fireEvent.mouseEnter(screen.getByRole('combobox', { name: /Failed/ }).parentElement!);
        fireEvent.mouseEnter(screen.getByRole('combobox', { name: /Blocked/ }).parentElement!);

        rerender(<MatrixTooltipProvider>{cell('Passed')}{cell('Blocked', 'export', 'Export prüfen')}</MatrixTooltipProvider>);
        expect(screen.getByRole('tooltip').textContent).toBe('Blocked · Export prüfen · Release / Regression');

        rerender(<MatrixTooltipProvider>{null}{cell('Blocked', 'export', 'Export prüfen')}</MatrixTooltipProvider>);
        expect(screen.getByRole('tooltip').textContent).toBe('Blocked · Export prüfen · Release / Regression');
    });
});


describe('Active outcome action', () => {
    it('labels Unspecified as Active in the chip, selection and tooltip', () => {
        render(<MatrixTooltipProvider>{cell('Unspecified')}</MatrixTooltipProvider>);
        const select = screen.getByRole('combobox', {name: /^Active/}) as HTMLSelectElement;
        expect(select.value).toBe('Unspecified');
        expect(select.selectedOptions[0].textContent).toBe('Active');
        expect(select.parentElement?.querySelector('.relations-view-outcome-chip-active')?.textContent).toBe('ACT');
        fireEvent.mouseEnter(select.parentElement!);
        expect(screen.getByRole('tooltip').textContent).toContain('Active');
        expect(screen.getByRole('tooltip').textContent).not.toContain('Unspecified');
    });
    it('submits ResetToActive as a separate command', () => {
        const change = vi.fn();
        render(<MatrixTooltipProvider><MatrixCell {...defaults} onChange={change} projection={projection('Failed')} /></MatrixTooltipProvider>);
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'ResetToActive'}});
        expect(change).toHaveBeenCalledExactlyOnceWith('ResetToActive');
        expect(screen.getByRole('option', {name: 'Reset to active'})).toBeTruthy();
    });
    it('previews reset with matching blue ACT styling and submits only on Enter', () => {
        const change = vi.fn();
        render(<MatrixTooltipProvider><MatrixCell {...defaults} onChange={change} projection={projection('Inconclusive')} /></MatrixTooltipProvider>);
        const select = screen.getByRole('combobox');
        fireEvent.keyDown(select, {key: 'ArrowDown'});
        expect(select.parentElement?.querySelector('.relations-view-outcome-chip-active')?.textContent).toBe('ACT');
        expect(change).not.toHaveBeenCalled();
        fireEvent.keyDown(select, {key: 'Escape'});
        expect(select.parentElement?.querySelector('.relations-view-outcome-chip')?.textContent).toBe('INC');
        fireEvent.keyDown(select, {key: 'ArrowDown'});
        fireEvent.keyDown(select, {key: 'Enter'});
        expect(change).toHaveBeenCalledExactlyOnceWith('ResetToActive');
    });
});
