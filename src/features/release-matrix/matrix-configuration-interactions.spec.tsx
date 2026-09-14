// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { emptyMatrixConfig, sanitizeMatrixConfig, type MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { matrixGroups } from './matrix-presentation.js';
import { MatrixTable } from './matrix-table.js';
import { MatrixSettings } from './matrix-settings.js';

afterEach(cleanup);
async function fixture() {
    const { services } = matrixTestServices();
    const snapshot: MatrixSnapshot = { ...await loadReleaseMatrix(1, services), contextIdentity: 'https://dev.azure.com/contract-org/contract-project' };
    const config = { ...emptyMatrixConfig(1, 10), columns: [{ id: 'release', name: 'Version', environment: 'Test', tag: '2.1.0-Test', rootSuiteId: 20, visible: true }] };
    return { snapshot, config };
}

describe('Matrix configuration interactions', () => {
    it.each(['untagged', 'tag:smoke'])('keeps suite collapse independent of a colliding tag group: %s', async suiteName => {
        const { snapshot, config } = await fixture();
        snapshot.suites.find(s => s.id === 11)!.name = suiteName;
        snapshot.projections = snapshot.projections.map(p => ({ ...p, tags: suiteName === 'tag:smoke' ? ['Smoke'] : [] }));
        config.tags = ['Smoke'];
        const tagLabel = suiteName === 'tag:smoke' ? 'Smoke' : 'Ohne Gruppierungs-Tag';
        function StatefulTable() {
            const [value, setValue] = React.useState<MatrixConfig>(config);
            return <>
                <button onClick={() => setValue(v => ({ ...v, grouping: v.grouping === 'suites' ? 'tags' : 'suites' }))}>Modus wechseln</button>
                <MatrixTable snapshot={snapshot} config={value} groups={matrixGroups(snapshot, value)} pending={new Set()}
                    update={patch => setValue(v => sanitizeMatrixConfig({ ...v, ...patch })!)} record={vi.fn()} onConfigure={vi.fn()} />
            </>;
        }
        render(<StatefulTable />);
        const switchMode = () => fireEvent.click(screen.getByRole('button', { name: 'Modus wechseln' }));
        fireEvent.click(screen.getByRole('button', { name: `Gruppe ${suiteName} einklappen` }));
        switchMode();
        fireEvent.click(screen.getByRole('button', { name: `Gruppe ${tagLabel} einklappen` }));
        switchMode();
        fireEvent.click(screen.getByRole('button', { name: `Gruppe ${suiteName} aufklappen` }));
        switchMode();
        fireEvent.click(screen.getByRole('button', { name: `Gruppe ${tagLabel} aufklappen` }));
        switchMode();
        expect(screen.getByRole('button', { name: `Gruppe ${suiteName} einklappen` }).getAttribute('aria-expanded')).toBe('true');
    });

    it('keeps hidden groups in the configured order when moving a visible group', async () => {
        const { snapshot, config } = await fixture();
        config.groupOrder = ['Allgemein', 'Data Import', 'Regression'];
        config.tagFilter = 'Visible';
        snapshot.projections = snapshot.projections.map(p => ({ ...p, tags: [p.suiteId === 11 || p.suiteId === 13 ? 'Visible' : 'Hidden'] }));
        const groups = matrixGroups(snapshot, config);
        expect(groups.map(g => g.id)).toEqual(['Allgemein', 'Regression']);
        const update = vi.fn();
        render(<MatrixTable snapshot={snapshot} config={config} groups={groups} pending={new Set()}
            update={update} record={vi.fn()} onConfigure={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Gruppe Regression nach oben' }));

        expect(update).toHaveBeenCalledWith({ groupOrder: ['Regression', 'Data Import', 'Allgemein'] });
    });

    it.each([false, true])('merges catalog names but identifies physical source candidates by path and ID (identical paths: %s)', async identicalPaths => {
        const { snapshot, config } = await fixture();
        snapshot.suites.find(s => s.id === 12)!.name = 'Regression';
        Object.assign(snapshot.suites.find(s => s.id === 21)!, { name: 'Regression', path: 'Plan > A > Regression' });
        Object.assign(snapshot.suites.find(s => s.id === 22)!, { name: 'Regression', path: `Plan > ${identicalPaths ? 'A' : 'B'} > Regression` });
        const update = vi.fn();
        const { container } = render(<>
            <MatrixSettings snapshot={snapshot} config={config} update={update} />
            <MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set()}
                update={update} record={vi.fn()} onConfigure={vi.fn()} />
        </>);
        const select = screen.getByRole('combobox', { name: 'Suite für Regression / Version' });
        expect(screen.getAllByRole('button', { name: 'Gruppe Regression einklappen' })).toHaveLength(1);
        expect(container.querySelectorAll(`[data-matrix-row='["Regression",201]']`)).toHaveLength(1);
        expect(select.textContent).toContain('Plan > A > Regression (#21) · Suite-Tag: 2.1.0-Test');
        expect(select.textContent).toContain(`Plan > ${identicalPaths ? 'A' : 'B'} > Regression (#22) · Suite-Tag: 2.1.0-Test`);
        fireEvent.change(select, { target: { value: '21' } });
        expect(update).toHaveBeenLastCalledWith({ mappings: { [JSON.stringify(['Regression','release'])]: 21 } });
        fireEvent.change(select, { target: { value: '22' } });
        expect(update).toHaveBeenLastCalledWith({ mappings: { [JSON.stringify(['Regression','release'])]: 22 } });
    });
});
