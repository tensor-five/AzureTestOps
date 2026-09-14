// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { matrixHierarchyFixture } from '../../../tests/fixtures/matrix-hierarchy.js';
import { useMatrixSuiteMembership } from './use-matrix-suite-membership.js';
import { matrixGroups } from './matrix-presentation.js';
import type { MatrixSuiteMembership } from '../../application/dto/release-matrix.dto.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const { snapshot, config } = matrixHierarchyFixture();
  snapshot.projections = snapshot.projections.filter(p => p.suiteId !== 42);
  snapshot.suiteMemberships = { '22': [100], '23': [100, 200], '25': [100], '32': [100] };
  const scope = { setId: 'set', planId: 1, contextIdentity: snapshot.contextIdentity };
  const loadMembership = vi.fn(async (_set: string, suiteId: number, contextIdentity: string, _signal?: AbortSignal): Promise<MatrixSuiteMembership> => ({ planId: 1, suiteId, contextIdentity, workItemIds: [100] }));
  const port = { load: vi.fn(), record: vi.fn(), loadMembership };
  return { snapshot, config, scope, port };
}
it('loads an unselected filter suite and keeps selected-version rows with matching case IDs', async () => {
  const f = fixture();
  const hook = renderHook(() => useMatrixSuiteMembership(f.port, f.scope, f.snapshot, '42', 1));
  expect(hook.result.current.loading).toBe(true);
  expect(hook.result.current.pending).toBe(true);
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(f.port.loadMembership).toHaveBeenCalledExactlyOnceWith('set', 42, 'test-context', expect.any(AbortSignal));
  expect(matrixGroups(hook.result.current.snapshot!, { ...f.config, suiteFilter: '42' }).flatMap(g => g.rows).map(row => row.workItemId)).toEqual([100, 100, 100]);
  expect(f.port.load).not.toHaveBeenCalled();
});
it.each(['', '22'])('does not read when membership is unnecessary or already supplied: %s', filter => {
  const f = fixture();
  const hook = renderHook(() => useMatrixSuiteMembership(f.port, f.scope, f.snapshot, filter, 1));
  expect(hook.result.current.pending).toBe(false);
  expect(f.port.loadMembership).not.toHaveBeenCalled();
});
it('keeps old projection-based stubs compatible but never treats a missing mapped suite as empty', async () => {
  const f = fixture();
  const old = { ...f.snapshot }; delete old.suiteMemberships;
  const port = { load: vi.fn(), record: vi.fn() };
  const hook = renderHook(({ snapshot }) => useMatrixSuiteMembership(port, f.scope, snapshot, '42', 1), { initialProps: { snapshot: old } });
  expect(hook.result.current.pending).toBe(false);
  hook.rerender({ snapshot: f.snapshot });
  await waitFor(() => expect(hook.result.current.error).toContain('kann nicht geladen'));
  expect(hook.result.current.pending).toBe(true);
});
it.each(['filter', 'set', 'context', 'generation'] as const)('aborts and ignores stale membership after %s changes', async change => {
  const f = fixture();
  let finish!: (value: MatrixSuiteMembership) => void;
  f.port.loadMembership.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const initial = { scope: f.scope, snapshot: f.snapshot, filter: '42', generation: 1 };
  const hook = renderHook(p => useMatrixSuiteMembership(f.port, p.scope, p.snapshot, p.filter, p.generation), { initialProps: initial });
  const firstSignal = f.port.loadMembership.mock.calls[0][3]!;
  const next = { ...initial, scope: { ...initial.scope } };
  if (change === 'filter') next.filter = '10';
  if (change === 'set') next.scope.setId = 'other';
  if (change === 'context') { next.scope.contextIdentity = 'other-context'; next.snapshot = { ...f.snapshot, contextIdentity: 'other-context' }; }
  if (change === 'generation') next.generation = 2;
  hook.rerender(next);
  expect(firstSignal.aborted).toBe(true);
  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  await act(async () => finish({ planId: 1, suiteId: 42, contextIdentity: 'test-context', workItemIds: [999] }));
  expect(hook.result.current.snapshot?.suiteMemberships?.[next.filter]).toEqual([100]);
  expect(f.port.load).not.toHaveBeenCalled();
});
it('rejects a membership reply from a different plan', async () => {
  const f = fixture();
  f.port.loadMembership.mockResolvedValue({ planId: 2, suiteId: 42, contextIdentity: 'test-context', workItemIds: [100] });
  const hook = renderHook(() => useMatrixSuiteMembership(f.port, f.scope, f.snapshot, '42', 1));
  await waitFor(() => expect(hook.result.current.error).toContain('passt nicht'));
  expect(hook.result.current.pending).toBe(true);
});
it('does not extend local membership freshness when changing filters and does not cache across remounts', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const f = fixture();
  const hook = renderHook(({ filter }) => useMatrixSuiteMembership(f.port, f.scope, f.snapshot, filter, 1), { initialProps: { filter: '42' } });
  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  hook.rerender({ filter: '' }); now.mockReturnValue(60_999); hook.rerender({ filter: '42' });
  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  expect(f.port.loadMembership).toHaveBeenCalledTimes(1);
  hook.rerender({ filter: '' }); now.mockReturnValue(61_000); hook.rerender({ filter: '42' });
  await waitFor(() => expect(f.port.loadMembership).toHaveBeenCalledTimes(2));
  hook.unmount();
  renderHook(() => useMatrixSuiteMembership(f.port, f.scope, f.snapshot, '42', 1));
  await waitFor(() => expect(f.port.loadMembership).toHaveBeenCalledTimes(3));
});
