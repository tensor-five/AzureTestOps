// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WithClientPorts, buildClientPortsStub } from '../../app/composition/test-client-ports.js';
import type { ActiveSetSnapshotStreamEvent } from '../../application/ports/client/active-set-snapshot-client.port.js';
import { loadTestCaseProjections } from '../../application/use-cases/load-test-case-projections.use-case.js';
import { resetActiveServices } from '../../../tests/fixtures/reset-active.js';
import { useActiveSetSnapshot } from './use-active-set-snapshot.js';
afterEach(cleanup);

async function fixture() {
  const {services} = resetActiveServices();
  const data = await loadTestCaseProjections({planId: 1, rootSuiteId: 20}, services);
  const snapshot = {...data, set: {id: 'set', name: 'Set', planId: '1', rootSuiteId: '20', queryId: 'q'}, loadedAt: 'now', workItemsFromQuery: []};
  const callbacks: Array<(event: ActiveSetSnapshotStreamEvent) => void> = [];
  const ports = buildClientPortsStub({activeSetSnapshot: {subscribe: (_id, callback) => {callbacks.push(callback); return {close() {}};}}});
  const hook = renderHook(({scope}) => useActiveSetSnapshot('set', scope), {initialProps: {scope: 'context-one'}, wrapper: ({children}) => <WithClientPorts ports={ports}>{children}</WithClientPorts>});
  const original = snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)!;
  const active = {...original, lastOutcome: 'Unspecified', lastRunId: null, lastResultId: null, lastResultCompletedDate: null};
  return {...hook, snapshot, callbacks, active};
}
it('keeps a newer confirmation over an in-flight read but accepts a later explicit refresh', async () => {
  const f = await fixture();
  act(() => f.result.current.applyOutcome(f.active));
  act(() => f.callbacks[0]({type: 'result', snapshot: f.snapshot}));
  expect(f.result.current.state.snapshot?.projections.find(p => p.testPointId === f.active.testPointId)?.lastOutcome).toBe('Unspecified');
  act(() => f.result.current.refresh());
  act(() => f.callbacks[1]({type: 'result', snapshot: f.snapshot}));
  expect(f.result.current.state.snapshot?.projections.find(p => p.testPointId === f.active.testPointId)?.lastOutcome).toBe('Failed');
});
it('clears confirmations on Azure scope changes and rejects callbacks from an older scope', async () => {
  const f = await fixture();
  const oldApply = f.result.current.applyOutcome;
  act(() => oldApply(f.active));
  f.rerender({scope: 'context-two'});
  act(() => f.callbacks[0]({type: 'result', snapshot: f.snapshot}));
  expect(f.result.current.state.snapshot).toBeNull();
  act(() => oldApply(f.active));
  act(() => f.callbacks[1]({type: 'result', snapshot: f.snapshot}));
  expect(f.result.current.state.snapshot?.projections.find(p => p.testPointId === f.active.testPointId)?.lastOutcome).toBe('Failed');
});
