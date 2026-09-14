// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import type { MatrixActionResult, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { ApiError } from '../../application/dto/api-error.js';
import type { UserPreferences } from '../../shared/user-preferences/user-preferences.schema.js';
import { matrixPreferenceStore } from './matrix-preference-store.js';
import { ReleaseMatrixPane } from './release-matrix-pane.js';

let port: ReleaseMatrixClientPort;
let preferences: UserPreferences;
const persist = vi.fn((patch: Partial<UserPreferences>) => { preferences = { ...preferences, ...patch }; });
vi.mock('../../app/composition/client-ports-context.js', () => ({ useClientPorts: () => ({ releaseMatrix: port }) }));
vi.mock('../../shared/user-preferences/user-preferences.client.js', () => ({
  getCachedUserPreferences: () => preferences,
  isUserPreferencesCacheAuthoritative: () => true,
  persistUserPreferencesPatch: (patch: Partial<UserPreferences>) => persist(patch)
}));

beforeEach(() => { preferences = {}; persist.mockClear(); matrixPreferenceStore.clearForTests(); });
afterEach(() => { cleanup(); matrixPreferenceStore.clearForTests(); });

function fixture(multipleEnvironments = false) {
  const { snapshot, config } = matrixHierarchyFixture();
  config.columns = [
    { id: 'older', versionSuiteId: 20, visible: true },
    { id: 'current', versionSuiteId: 30, visible: true },
    { id: 'next', versionSuiteId: 40, visible: true }
  ];
  for (const [id, name] of [[20, '2.0.2'], [30, '2.1.0'], [40, '2.1.1']] as const) snapshot.suites.find(s => s.id === id)!.name = name;
  snapshot.projections = snapshot.projections.filter(p => p.workItemId === 100 && [25, 32, 42, ...(multipleEnvironments ? [22] : [])].includes(p.suiteId));
  for (const projection of snapshot.projections) {
    projection.testPointId = projection.suiteId * 100;
    projection.lastOutcome = projection.suiteId === 25 ? 'Passed' : 'Failed';
    const content = snapshot.suites.find(s => s.id === projection.suiteId)!;
    const environment = snapshot.suites.find(s => s.id === content.parentSuiteId)!;
    const version = snapshot.suites.find(s => s.id === environment.parentSuiteId)!;
    projection.suitePath = content.path = `${version.name} > ${environment.name} > ${content.name}`;
    snapshot.pointCounts[`${projection.suiteId}:100`] = 1;
  }
  preferences = { setReleaseMatrices: { comparison: config } };
  port = { load: vi.fn(async () => snapshot), record: vi.fn() };
  return { snapshot, config };
}
async function mount() {
  const view = render(<ReleaseMatrixPane setId="comparison" planId={1} rootSuiteId={10} contextIdentity="test-context"/>);
  await waitFor(() => expect(screen.queryByText('Matrix wird geladen …')).toBeNull());
  return view;
}
const toggle = () => fireEvent.click(screen.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' }));
const dataRows = (container: HTMLElement) => container.querySelectorAll('[data-matrix-row]');
const statusIn = (row: Element, column: string) => row.querySelector<HTMLSelectElement>(`[data-matrix-column="${column}"] .matrix-cell-control select`)!;

describe('Environment toggle through the persisted matrix pane', () => {
  it('combines version-specific environments locally, persists the setting and restores the original grouping', async () => {
    fixture();
    const view = await mount();
    expect(dataRows(view.container)).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' })).toHaveProperty('checked', true);
    toggle();
    expect(dataRows(view.container)).toHaveLength(1);
    const row = dataRows(view.container)[0];
    expect(['older', 'current', 'next'].map(column => statusIn(row, column).value)).toEqual(['Passed', 'Failed', 'Failed']);
    expect(screen.getByRole('combobox', { name: 'Gruppieren nach' })).toHaveProperty('value', 'content');
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ setReleaseMatrices: { comparison: expect.objectContaining({ separateEnvironments: false, grouping: 'environment' }) } }));
    view.unmount();
    const reopened = await mount();
    expect(dataRows(reopened.container)).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' })).toHaveProperty('checked', false);
    toggle();
    expect(dataRows(reopened.container)).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Gruppieren nach' })).toHaveProperty('value', 'environment');
    expect(port.load).toHaveBeenCalledTimes(1);
    expect(port.record).not.toHaveBeenCalled();
  });

  it('keeps a reset bound to the selected physical point while switching the presentation during confirmation', async () => {
    const { snapshot } = fixture();
    let finish!: (result: MatrixActionResult) => void;
    vi.mocked(port.record).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = await mount();
    toggle();
    const source = snapshot.projections.find(p => p.suiteId === 25)!;
    const select = statusIn(dataRows(view.container)[0], 'older');
    fireEvent.change(select, { target: { value: 'ResetToActive' } });
    const target: MatrixWrite = { contextIdentity: 'test-context', planId: 1, suiteId: 25, workItemId: 100, pointId: 2500, outcome: 'ResetToActive' };
    expect(port.record).toHaveBeenCalledWith('comparison', target);
    expect(select.value).toBe('Passed');
    expect(select.disabled).toBe(true);
    toggle();
    const separate = [...dataRows(view.container)].find(row => statusIn(row, 'older'))!;
    expect(statusIn(separate, 'older').disabled).toBe(true);
    await act(async () => finish({ runId: null, resetToActive: true, projection: { ...source, lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null } }));
    expect(statusIn(separate, 'older').value).toBe('Unspecified');
    expect(within(separate as HTMLElement).getByText('ACT')).toBeTruthy();
    toggle();
    const combined = dataRows(view.container)[0];
    expect(statusIn(combined, 'older').value).toBe('Unspecified');
    expect(statusIn(combined, 'current').value).toBe('Failed');
    expect(statusIn(combined, 'next').value).toBe('Failed');
    expect(port.record).toHaveBeenCalledTimes(1);
    expect(port.load).toHaveBeenCalledTimes(1);
  });

  it('does not write on environment selection and retains an uncertain write block across view switches', async () => {
    fixture(true);
    vi.mocked(port.record).mockRejectedValue(new ApiError(500, 'MATRIX_RUN_UNCONFIRMED', 'Durchlauf nicht bestätigt', { runId: 901 }));
    const view = await mount();
    toggle();
    expect(statusIn(dataRows(view.container)[0], 'older')).toBeNull();
    const choose = screen.getByRole('combobox', { name: 'Umgebung für Regression / #100 / 2.0.2' });
    fireEvent.change(choose, { target: { value: '25' } });
    expect(port.record).not.toHaveBeenCalled();
    const selected = statusIn(dataRows(view.container)[0], 'older');
    fireEvent.change(selected, { target: { value: 'Failed' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Durchlauf nicht bestätigt'));
    expect(selected.value).toBe('Passed');
    expect(selected.disabled).toBe(true);
    toggle(); toggle();
    expect(statusIn(dataRows(view.container)[0], 'older').disabled).toBe(true);
    expect(port.record).toHaveBeenCalledTimes(1);
    expect(port.load).toHaveBeenCalledTimes(1);
    expect(preferences.setReleaseMatrices?.comparison.combinedMappings).toEqual({ '["Regression",100,"older"]': 25 });
  });
});
