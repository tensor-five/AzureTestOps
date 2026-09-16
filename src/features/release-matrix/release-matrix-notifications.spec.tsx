// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { ApiError } from '../../application/dto/api-error.js';
import { ReleaseMatrixPane } from './release-matrix-pane.js';
import type { MatrixRefreshState } from './release-matrix-pane.js';

let port: ReleaseMatrixClientPort;
let fixture: ReturnType<typeof matrixHierarchyFixture>;
vi.mock('../../app/composition/client-ports-context.js', () => ({ useClientPorts: () => ({releaseMatrix: port}) }));
vi.mock('./matrix-preference-store.js', () => ({ matrixPreferenceStore: { load: () => fixture.config, save: vi.fn() } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function mountMatrix(failure: boolean) {
  fixture = matrixHierarchyFixture();
  const projection = fixture.snapshot.projections.find(p => p.suiteId === 22 && p.workItemId === 100)!;
  projection.testPointId = 22100;
  fixture.snapshot.pointCounts['22:100'] = 1;
  port = {
    load: vi.fn(async () => fixture.snapshot),
    record: vi.fn(async () => {
      if (failure) throw new ApiError(500, 'MATRIX_RUN_UNCONFIRMED', 'Durchlauf nicht bestätigt', {runId:100});
      return {runId: 100, projection: {...projection, lastRunId:100, lastResultId:1000, lastOutcome:'Passed'}};
    })
  };
  let refreshState: MatrixRefreshState | null = null;
  const view = render(<ReleaseMatrixPane setId="catalog" planId={1} rootSuiteId={10} contextIdentity={fixture.snapshot.contextIdentity}
    onRefreshStateChange={state => { refreshState = state; }}/>);
  await waitFor(() => expect(screen.queryByText('Matrix wird geladen …')).toBeNull());
  const select = [...view.container.querySelectorAll<HTMLSelectElement>('.matrix-cell-control select')].find(select => !select.disabled)!;
  expect(select).toBeDefined();
  return {view, select, refresh: () => (refreshState as MatrixRefreshState).refresh()};
}

describe('Matrix notification integration', () => {
  it.each([false, true])('removes the overlay after its deadline and preserves outcome/blocking state (error: %s)', async failure => {
    const {view, select} = await mountMatrix(failure);
    vi.useFakeTimers();
    await act(async () => fireEvent.change(select, {target: {value:'Passed'}}));
    const role = failure ? 'alert' : 'status';
    expect(screen.getByRole(role).closest('.notification-toast')).not.toBeNull();
    expect(view.container.querySelectorAll('.notification-toast')).toHaveLength(1);
    expect(view.container.querySelector('.matrix-success, .matrix-error')).toBeNull();
    act(() => vi.advanceTimersByTime(failure ? 5000 : 2000));
    expect(screen.queryByRole(role)).toBeNull();
    expect(select.disabled).toBe(failure);
    if (!failure) expect(select.value).toBe('Passed');
    expect(port.record).toHaveBeenCalledTimes(1);
  });

  it('announces repeated load failures again for five seconds', async () => {
    const {refresh} = await mountMatrix(false);
    vi.mocked(port.load).mockRejectedValue(new Error('Verbindung unterbrochen'));
    vi.useFakeTimers();
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => refresh());
      expect(screen.getByRole('alert').textContent).toContain('Verbindung unterbrochen');
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });
});
