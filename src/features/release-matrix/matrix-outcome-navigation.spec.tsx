// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { matrixGroups } from './matrix-presentation.js';
import { MatrixTable } from './matrix-table.js';
import { MatrixTooltipProvider } from './matrix-tooltip.js';
import { focusAdjacentMatrixOutcome } from './matrix-outcome-navigation.js';

afterEach(cleanup);

function setup(options: { pending?: string[]; collapsed?: string[]; combined?: boolean; search?: string } = {}) {
    const { snapshot, config } = matrixHierarchyFixture();
    config.columns = [{ id: 'earlier', versionSuiteId: 40, visible: true }, config.columns[1]];
    config.collapsedByMode.environment = options.collapsed ?? [];
    config.search = options.search ?? '';
    if (options.combined) {
        config.separateEnvironments = false;
        config.combinedMappings = { '["Regression",100,"catalog-version"]': 22 };
    }
    for (const projection of snapshot.projections) {
        projection.testPointId = projection.suiteId * 1000 + projection.workItemId;
        projection.lastOutcome = 'Passed';
        snapshot.pointCounts[`${projection.suiteId}:${projection.workItemId}`] = 1;
    }
    const record = vi.fn().mockResolvedValue(undefined);
    const view = render(<MatrixTooltipProvider><MatrixTable snapshot={snapshot} config={config}
        groups={matrixGroups(snapshot, config)} pending={new Set(options.pending)}
        update={vi.fn()} record={record} onConfigure={vi.fn()} />
        <button>Außerhalb</button></MatrixTooltipProvider>);
    const statuses = (column: string) => Array.from(view.container.querySelectorAll<HTMLSelectElement>(
        `td[data-matrix-column="${column}"] .matrix-cell-control select`));
    return { ...view, record, statuses, user: userEvent.setup() };
}

describe('Release matrix vertical outcome navigation', () => {
    it.each([false, true])('moves Tab down and Shift+Tab up in the same column (combined: %s)', async combined => {
        const { statuses, user, record } = setup({ combined });
        const fields = statuses('catalog-version');
        expect(fields.length).toBeGreaterThan(1);
        act(() => fields[0].focus());
        await user.tab();
        expect(document.activeElement).toBe(fields[1]);
        await user.tab({ shift: true });
        expect(document.activeElement).toBe(fields[0]);
        expect(record).not.toHaveBeenCalled();
    });

    it('commits a keyboard status draft once before moving down', async () => {
        const { statuses, user, record } = setup();
        const fields = statuses('catalog-version');
        act(() => fields[0].focus());
        await user.keyboard('{ArrowDown}');
        expect(record).not.toHaveBeenCalled();
        await user.tab();
        expect(record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'Failed' }));
        expect(document.activeElement).toBe(fields[1]);
    });

    it('skips pending fields and missing memberships while crossing group boundaries', async () => {
        const { statuses, user } = setup({ pending: ['23:100'] });
        const fields = statuses('catalog-version');
        expect(fields[1].disabled).toBe(true);
        act(() => fields[0].focus());
        await user.tab();
        expect(document.activeElement).toBe(fields[2]);
        await user.tab();
        expect(document.activeElement).toBe(fields[3]);
        await user.tab({ shift: true });
        expect(document.activeElement).toBe(fields[2]);
    });

    it('uses only visible rows after filtering and collapsing', async () => {
        const { statuses, user } = setup({ collapsed: ['ACC'], search: 'CSV' });
        const fields = statuses('catalog-version');
        expect(fields).toHaveLength(2);
        act(() => fields[0].focus());
        await user.tab();
        expect(document.activeElement).toBe(fields[1]);
    });

    it('preserves native Tab at column boundaries so the table has no keyboard trap', async () => {
        const { statuses, user } = setup();
        const fields = statuses('catalog-version');
        act(() => fields.at(-1)!.focus());
        expect(focusAdjacentMatrixOutcome(fields.at(-1)!, 1)).toBe(false);
        await user.tab();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Außerhalb' }));
        expect(focusAdjacentMatrixOutcome(fields[0], -1)).toBe(false);
    });

    it('does not intercept an environment picker or an unrelated select', async () => {
        const { user } = setup({ combined: true });
        const picker = screen.getByRole('combobox', { name: 'Umgebung für Regression / #100 / Version' });
        act(() => picker.focus());
        await user.tab();
        expect(document.activeElement?.closest('.matrix-cell-control')).toBeTruthy();
        expect(focusAdjacentMatrixOutcome(document.createElement('select'), 1)).toBe(false);
    });
});
