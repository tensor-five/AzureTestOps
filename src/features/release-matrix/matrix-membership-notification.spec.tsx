// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { ReleaseMatrixPane } from './release-matrix-pane.js';

let port: ReleaseMatrixClientPort;
let fixture: ReturnType<typeof matrixHierarchyFixture>;
vi.mock('../../app/composition/client-ports-context.js', () => ({ useClientPorts: () => ({ releaseMatrix: port }) }));
vi.mock('./matrix-preference-store.js', () => ({ matrixPreferenceStore: { load: () => fixture.config, save: vi.fn() } }));
afterEach(cleanup);

it.each([false, true])('shows a filter-membership failure through the notification UI without a false empty result (missing capability: %s)', async missingCapability => {
  fixture = matrixHierarchyFixture();
  fixture.snapshot.projections = fixture.snapshot.projections.filter(p => p.suiteId !== 42);
  fixture.snapshot.suiteMemberships = { '22': [100], '23': [100, 200], '25': [100], '32': [100] };
  fixture.config.suiteFilter = '42';
  port = { load: vi.fn(async () => fixture.snapshot), record: vi.fn(),
    ...(missingCapability ? {} : { loadMembership: vi.fn(async () => { throw new Error('offline'); }) }) };
  const view = render(<ReleaseMatrixPane setId="catalog" planId={1} rootSuiteId={10} contextIdentity={fixture.snapshot.contextIdentity}/>);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Suite-Zugehörigkeit'));
  expect(screen.getByRole('alert').closest('.notification-toast')).not.toBeNull();
  expect(view.container.querySelectorAll('.notification-toast')).toHaveLength(1);
  expect(screen.queryByText('Matrix wird geladen …')).toBeNull();
  expect(screen.queryByText('Keine Testfälle für diese Filter.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Matrix aktualisieren' })).toBeNull();
  expect(port.load).toHaveBeenCalledTimes(1);
  expect(port.record).not.toHaveBeenCalled();
  if (port.loadMembership) expect(port.loadMembership).toHaveBeenCalledTimes(1);
});
