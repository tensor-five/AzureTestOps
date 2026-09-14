// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
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

beforeEach(() => {
  const { snapshot, config } = matrixHierarchyFixture();
  config.columns = [config.columns[0]];
  preferences = { setReleaseMatrices: { comparison: config } };
  port = { load: vi.fn(async () => snapshot), record: vi.fn() };
  persist.mockClear();
  matrixPreferenceStore.clearForTests();
});
afterEach(() => { cleanup(); matrixPreferenceStore.clearForTests(); });

async function mount() {
  const view = render(<ReleaseMatrixPane setId="comparison" planId={1} rootSuiteId={10} contextIdentity="test-context" />);
  await waitFor(() => expect(screen.queryByText('Matrix wird geladen …')).toBeNull());
  return view;
}

describe('Resizable release-matrix title column', () => {
  it('previews a pointer resize, persists it once on release and performs no Azure request', async () => {
    const view = await mount();
    const handle = screen.getByRole('separator', { name: 'Breite der Testfallspalte ändern' });
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn(), configurable: true },
      hasPointerCapture: { value: vi.fn(() => false), configurable: true }
    });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 280 });
    expect(screen.getByRole('table', { name: 'Release-Matrix' }).getAttribute('style')).toContain('530px');
    expect(persist).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 280 });
    expect(preferences.setReleaseMatrices?.comparison.testCaseColumnWidth).toBe(530);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(port.load).toHaveBeenCalledTimes(1);
    expect(port.record).not.toHaveBeenCalled();

    const rowTitle = view.container.querySelector('.matrix-case-title');
    expect(rowTitle?.getAttribute('title')).toMatch(/^#\d+\s.+/);
  });

  it('discards a cancelled pointer preview without persistence', async () => {
    await mount();
    const handle = screen.getByRole('separator', { name: 'Breite der Testfallspalte ändern' });
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn(), configurable: true },
      hasPointerCapture: { value: vi.fn(() => false), configurable: true }
    });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 8, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 280 });
    expect(screen.getByRole('table', { name: 'Release-Matrix' }).getAttribute('style')).toContain('530px');

    fireEvent.pointerCancel(handle, { pointerId: 8, clientX: 280 });
    expect(screen.getByRole('table', { name: 'Release-Matrix' }).getAttribute('style')).toContain('350px');
    expect(persist).not.toHaveBeenCalled();
    expect(port.load).toHaveBeenCalledTimes(1);
    expect(port.record).not.toHaveBeenCalled();
  });

  it('supports arrow-key resizing with accessible bounds and restores the per-set width', async () => {
    const view = await mount();
    let handle = screen.getByRole('separator', { name: 'Breite der Testfallspalte ändern' });
    expect(handle.getAttribute('aria-valuemin')).toBe('240');
    expect(handle.getAttribute('aria-valuemax')).toBe('900');
    expect(handle.getAttribute('aria-valuenow')).toBe('350');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle.getAttribute('aria-valuenow')).toBe('410');
    expect(preferences.setReleaseMatrices?.comparison.testCaseColumnWidth).toBe(410);

    view.unmount();
    await act(async () => { await Promise.resolve(); });
    await mount();
    handle = screen.getByRole('separator', { name: 'Breite der Testfallspalte ändern' });
    expect(handle.getAttribute('aria-valuenow')).toBe('410');
    expect(port.load).toHaveBeenCalledTimes(1);
    expect(port.record).not.toHaveBeenCalled();
  });
});
