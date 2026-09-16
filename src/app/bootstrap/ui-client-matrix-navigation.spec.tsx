// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RelationMutationsApi } from '../../features/relations-view/use-relation-mutations.js';
import { getMatrixMutationStore } from '../../features/release-matrix/matrix-mutation-store.js';
import { AppShell } from './ui-client.js';
import { WithClientPorts, buildClientPortsStub } from '../composition/test-client-ports.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { loadTestCaseProjections } from '../../application/use-cases/load-test-case-projections.use-case.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { installUserPreferencesPort, resetUserPreferencesCacheForTests } from '../../shared/user-preferences/user-preferences.client.js';

const captured = vi.hoisted(() => ({ current: null as RelationMutationsApi | null }));
vi.mock('../../features/relations-view/use-relation-mutations.js', async importOriginal => {
    const actual = await importOriginal<typeof import('../../features/relations-view/use-relation-mutations.js')>();
    return { ...actual, useRelationMutations: (...args: Parameters<typeof actual.useRelationMutations>) => {
        const result = actual.useRelationMutations(...args);
        captured.current = result;
        return result;
    } };
});
afterEach(() => { cleanup(); resetUserPreferencesCacheForTests(); localStorage.clear(); vi.restoreAllMocks(); });

async function fixture(setContext: {organization?: string; project?: string} = {}) {
    const { services, azure } = matrixTestServices();
    azure.membership[11] = [...new Set(azure.membership[11])];
    const loaded = await loadTestCaseProjections({ planId: 1, rootSuiteId: 10 }, services);
    const matrix = await loadReleaseMatrix(1, services);
    const set = { id: 'catalog', name: 'Catalog', planId: '1', rootSuiteId: '10', queryId: 'bugs', ...setContext };
    const snapshot = { ...loaded, set, loadedAt: '2026-09-14T10:00:00Z', workItemsFromQuery: [{
        id: 501, title: 'Import bug', workItemType: 'Bug', state: 'Active', assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [],
    }] };
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const add = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    const ports = buildClientPortsStub({
        authPreflight: { check: vi.fn(async () => 'READY' as const) },
        adoContext: { getContext: vi.fn(async () => ({ organization: 'contract-org', project: 'contract-project' })), setContext: vi.fn(), getCliDefaults: vi.fn() },
        setManagement: { list: vi.fn(async () => ({ sets: [set], activeSetId: set.id })), create: vi.fn(), update: vi.fn(), delete: vi.fn(), setActive: vi.fn() },
        activeSetSnapshot: { subscribe: vi.fn((_id, event) => { queueMicrotask(() => event({ type: 'result', snapshot })); return { close: vi.fn() }; }) },
        relationMutations: { add, remove: vi.fn(async () => {}) },
        workItemDeepLink: { buildHref: () => '#case' }, testSuiteDeepLink: { buildHref: () => '#suite' },
    });
    ports.releaseMatrix = { load: vi.fn(async () => ({ ...matrix, contextIdentity: 'https://dev.azure.com/contract-org/contract-project' })), record: vi.fn() };
    installUserPreferencesPort(ports.userPreferences);
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<WithClientPorts ports={ports}><AppShell /></WithClientPorts>); });
    await waitFor(() => expect(view.container.querySelector('.relations-workspace')).not.toBeNull());
    const matching = view.container.querySelector('.relations-workspace')!;
    return { matching, view, add, ports, snapshot, resolve: () => resolve(), reject: () => reject(new Error('Relation konnte nicht gespeichert werden.')) };
}

describe('App navigation retains matching mutations', () => {
    it('uses the header refresh for the matrix and shows the current view update time', async () => {
        const f = await fixture();
        const matchingTime = f.view.container.querySelector<HTMLTimeElement>('.ui-shell-brand time');
        expect(matchingTime?.dateTime).toBe(new Date(f.snapshot.loadedAt).toISOString());
        const subscribe = vi.mocked(f.ports.activeSetSnapshot.subscribe);
        expect(subscribe).toHaveBeenCalledTimes(1);

        await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Release-Matrix'})); });
        await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', {name: 'Refresh release matrix'}).disabled).toBe(false));
        expect(screen.queryByRole('button', {name: 'Matrix aktualisieren'})).toBeNull();
        expect(f.view.container.querySelector('.ui-shell-brand time')?.textContent).toContain('Aktualisiert');
        const load = vi.mocked(f.ports.releaseMatrix!.load);
        expect(load).toHaveBeenCalledTimes(1);

        await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Refresh release matrix'})); });
        expect(load).toHaveBeenCalledTimes(2);
        expect(subscribe).toHaveBeenCalledTimes(1);

        await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Zuordnung'})); });
        expect(f.view.container.querySelector<HTMLTimeElement>('.ui-shell-brand time')?.dateTime).toBe(new Date(f.snapshot.loadedAt).toISOString());
    });
    it('does not synchronize a set-bound matrix into matching loaded from another global context', async () => {
        const f = await fixture({organization: 'other-org', project: 'other-project'});
        const projection = {...f.snapshot.projections.find(p => p.suiteId === 11 && p.workItemId === 201)!, lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null};
        const before = f.matching.querySelector('[data-item-key="tc:201:11"] .relations-view-outcome-chip')?.textContent;
        f.ports.releaseMatrix!.record = vi.fn(async () => ({runId: null, resetToActive: true as const, projection}));
        const contextIdentity = 'https://dev.azure.com/other-org/other-project';
        const store = getMatrixMutationStore(f.ports.releaseMatrix!, 'catalog', 1, contextIdentity);
        await act(async () => { await store.record({planId: 1, suiteId: 11, workItemId: 201, pointId: 11201, contextIdentity, outcome: 'ResetToActive'}); });
        expect(f.matching.querySelector('[data-item-key="tc:201:11"] .relations-view-outcome-chip')?.textContent).toBe(before);
    });
    it('applies a confirmed reset in the hidden matching view without clearing pending relations', async () => {
        const f = await fixture();
        let mutation!: Promise<void>;
        act(() => { mutation = captured.current!.addRelation(201, 501); });
        await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Release-Matrix'})); });
        const projection = {...f.snapshot.projections.find(p => p.suiteId === 11 && p.workItemId === 201)!,
          lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null};
        f.ports.releaseMatrix!.record = vi.fn(async () => ({runId: null, resetToActive: true as const, projection}));
        const store = getMatrixMutationStore(f.ports.releaseMatrix!, 'catalog', 1, 'https://dev.azure.com/contract-org/contract-project');
        await act(async () => { await store.record({planId: 1, suiteId: 11, workItemId: 201, pointId: 11201,
          contextIdentity: 'https://dev.azure.com/contract-org/contract-project', outcome: 'ResetToActive'}); });
        expect(f.matching.querySelector('[data-item-key="tc:201:11"] .relations-view-outcome-chip')?.textContent).toBe('ACT');
        expect(captured.current!.isPending(201, 501)).toBe(true);
        await act(async () => { f.resolve(); await mutation; });
        expect(captured.current!.isRelated(201, 501)).toBe(true);
        expect(f.view.container.querySelector('.relations-workspace')).toBe(f.matching);
    });
    it('keeps confirmed relation overrides when the loaded Azure snapshot has not caught up', async () => {
        const f = await fixture();
        let mutation!: Promise<void>;
        act(() => { mutation = captured.current!.addRelation(201, 501); });
        await act(async () => { f.resolve(); await mutation; });
        expect(captured.current!.isRelated(201, 501)).toBe(true);
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Release-Matrix' })); });
        await screen.findByRole('region', { name: 'Release-Matrix Ansicht' });
        expect(f.matching.closest('[hidden]')).not.toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zuordnung' })); });
        expect(f.view.container.querySelector('.relations-workspace')).toBe(f.matching);
        expect(f.matching.closest('[hidden]')).toBeNull();
        expect(captured.current!.isRelated(201, 501)).toBe(true);
        expect(f.add).toHaveBeenCalledTimes(1);
    }, 15000);

    it.each(['success', 'failure'] as const)('retains a pending relation and its %s across a hidden matching view', async outcome => {
        const f = await fixture();
        let mutation!: Promise<void>;
        act(() => { mutation = captured.current!.addRelation(201, 501); });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Release-Matrix' })); });
        await screen.findByRole('region', { name: 'Release-Matrix Ansicht' });
        expect(captured.current!.isPending(201, 501)).toBe(true);
        await act(async () => { outcome === 'success' ? f.resolve() : f.reject(); await mutation; });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zuordnung' })); });
        expect(f.view.container.querySelector('.relations-workspace')).toBe(f.matching);
        expect(captured.current!.isPending(201, 501)).toBe(false);
        expect(captured.current!.isRelated(201, 501)).toBe(outcome === 'success');
        if (outcome === 'failure') expect(screen.getByRole('alert').textContent).toContain('Relation konnte nicht gespeichert werden');
    }, 15000);
});
