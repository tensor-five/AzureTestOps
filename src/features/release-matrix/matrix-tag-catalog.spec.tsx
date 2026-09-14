// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { ReleaseMatrixPane } from './release-matrix-pane.js';

let port: ReleaseMatrixClientPort;
let fixture: ReturnType<typeof matrixHierarchyFixture>;
vi.mock('../../app/composition/client-ports-context.js', () => ({ useClientPorts: () => ({ releaseMatrix: port }) }));
vi.mock('./matrix-preference-store.js', () => ({ matrixPreferenceStore: { load: () => fixture.config, save: vi.fn() } }));
afterEach(cleanup);

it.each([false, true])('loads missing tag options on focus and reports catalog failures visibly (failure: %s)', async failure => {
  fixture = matrixHierarchyFixture();
  port = { load: vi.fn(async () => fixture.snapshot), record: vi.fn(), loadTagCatalog: vi.fn(async () => {
    if (failure) throw new Error('offline');
    return { planId: 1, contextIdentity: fixture.snapshot.contextIdentity, tags: ['Regress'] };
  }) };
  render(<ReleaseMatrixPane setId="tags" planId={1} rootSuiteId={10} contextIdentity={fixture.snapshot.contextIdentity}/>);
  await waitFor(() => expect(screen.queryByText('Matrix wird geladen …')).toBeNull());
  const select = screen.getByRole('combobox', { name: 'Tag' });
  expect(port.loadTagCatalog).not.toHaveBeenCalled();
  expect(within(select).queryByRole('option', { name: 'Regress' })).toBeNull();
  fireEvent.focus(select);
  if (failure) {
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Tags konnten nicht geladen werden'));
  } else {
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Regress' })).toBeTruthy());
    fireEvent.change(select, { target: { value: 'Regress' } });
    expect(select).toHaveProperty('value', 'Regress');
    expect(screen.getByText('Keine Testfälle für diese Filter.')).toBeTruthy();
  }
  expect(port.loadTagCatalog).toHaveBeenCalledTimes(1);
  expect(port.load).toHaveBeenCalledTimes(1);
  expect(port.record).not.toHaveBeenCalled();
});
