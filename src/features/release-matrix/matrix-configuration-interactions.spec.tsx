// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { emptyMatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { matrixGroups } from './matrix-presentation.js';
import { MatrixTable } from './matrix-table.js';
import { MatrixSettings } from './matrix-settings.js';

afterEach(cleanup);
async function fixture() {
    const { services } = matrixTestServices();
    const snapshot: MatrixSnapshot = { ...await loadReleaseMatrix(1, services), contextIdentity: 'https://dev.azure.com/contract-org/contract-project' };
    const config = { ...emptyMatrixConfig(1, 10), columns: [{ id: 'release', name: 'Version', environment: 'Test', tag: 'v-test', rootSuiteId: 20, visible: true }] };
    return { snapshot, config };
}

describe('Matrix configuration interactions', () => {
    it('keeps hidden groups in the configured order when moving a visible group', async () => {
        const { snapshot, config } = await fixture();
        config.groupOrder = ['13', '12', '11'];
        config.tagFilter = 'Visible';
        snapshot.projections = snapshot.projections.map(p => ({ ...p, tags: [p.suiteId === 11 || p.suiteId === 13 ? 'Visible' : 'Hidden'] }));
        const groups = matrixGroups(snapshot, config);
        expect(groups.map(g => g.id)).toEqual(['13', '11']);
        const update = vi.fn();
        render(<MatrixTable snapshot={snapshot} config={config} groups={groups} pending={new Set()}
            update={update} record={vi.fn()} onConfigure={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Gruppe Regression nach oben' }));

        expect(update).toHaveBeenCalledWith({ groupOrder: ['11', '12', '13'] });
    });

    it.each([false, true])('distinguishes equal source names consistently in mapping labels and group controls (identical paths: %s)', async identicalPaths => {
        const { snapshot, config } = await fixture();
        snapshot.suites.push(
            { id: 14, name: 'A', parentSuiteId: 10, depth: 2, path: 'Plan > Katalog > A', suiteType: 'StaticTestSuite' },
            { id: 15, name: identicalPaths ? 'A' : 'B', parentSuiteId: 10, depth: 2, path: `Plan > Katalog > ${identicalPaths ? 'A' : 'B'}`, suiteType: 'StaticTestSuite' },
        );
        Object.assign(snapshot.suites.find(s => s.id === 11)!, { name: 'Regression', parentSuiteId: 14 });
        Object.assign(snapshot.suites.find(s => s.id === 12)!, { name: 'Regression', parentSuiteId: 15 });
        const labelA = `A > Regression${identicalPaths ? ' (#11)' : ''}`;
        const labelB = identicalPaths ? 'A > Regression (#12)' : 'B > Regression';
        const update = vi.fn();
        render(<>
            <MatrixSettings snapshot={snapshot} config={config} update={update} />
            <MatrixTable snapshot={snapshot} config={config} groups={matrixGroups(snapshot, config)} pending={new Set()}
                update={update} record={vi.fn()} onConfigure={vi.fn()} />
        </>);
        for (const label of [labelA, labelB]) {
            const select = screen.getByRole('combobox', { name: `Suite für ${label} / Version` });
            expect(select.closest('label')?.firstChild?.textContent).toBe(label);
            expect(screen.getByRole('button', { name: `Gruppe ${label} einklappen` })).toBeTruthy();
        }
        fireEvent.change(screen.getByRole('combobox', { name: `Suite für ${labelA} / Version` }), { target: { value: '21' } });
        expect(update).toHaveBeenLastCalledWith({ mappings: { '11:release': 21 } });
        fireEvent.change(screen.getByRole('combobox', { name: `Suite für ${labelB} / Version` }), { target: { value: '22' } });
        expect(update).toHaveBeenLastCalledWith({ mappings: { '12:release': 22 } });
    });
});
