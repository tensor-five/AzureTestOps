// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReleaseMatrix } from './use-release-matrix.js';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import { matrixProjection } from '../../../tests/fixtures/matrix-hierarchy.js';
import { getMatrixMutationStore } from './matrix-mutation-store.js';
import { ApiError } from '../../application/dto/api-error.js';

vi.mock('./matrix-preference-store.js',()=>({matrixPreferenceStore:{load:()=>null,save:vi.fn()}}));
afterEach(() => cleanup());
const context = 'https://dev.azure.com/org/project';
function snapshots() {
  const preview: MatrixSnapshot = {planId:1,contextIdentity:context,suites:[],pointCounts:{'22:100':1},
    projections:[{...matrixProjection(22,100),testPointId:7,lastOutcome:'Failed',lastRunId:2,lastResultId:3}],
    loadedAt:'2026-10-15T07:00:00Z',freshness:{sourceReadAt:'2026-10-15T06:59:30Z',cacheUsed:true}};
  const fresh: MatrixSnapshot = {...preview,loadedAt:'2026-10-15T07:01:00Z',freshness:{sourceReadAt:'2026-10-15T07:01:00Z',cacheUsed:false},
    projections:preview.projections.map(value=>({...value,title:'Current data',lastOutcome:'Passed',lastRunId:10,lastResultId:11})),completedRunIds:[10],
    resultEvidence:[{runId:10,resultId:11,suiteId:22,workItemId:100,pointId:7,outcome:'Passed',completedDate:'2026-10-15T07:00:59Z'}]};
  return {preview,fresh};
}
function deferred<T>() {
  let resolve!: (value:T) => void, reject!: (error:Error) => void;
  const promise = new Promise<T>((yes,no) => {resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

it.each(['success','error'] as const)('shows an old preview immediately, keeps its source time and completes the background read with %s', async outcome => {
  const {preview,fresh} = snapshots(), read = deferred<MatrixSnapshot>();
  const client = {load:vi.fn(()=>read.promise),loadCached:vi.fn(async()=>preview),record:vi.fn()};
  const hook = renderHook(()=>useReleaseMatrix('release',1,10,client,context));
  await waitFor(()=>expect(hook.result.current.snapshot).toEqual(preview));
  expect(client.load).toHaveBeenCalledOnce();
  expect(hook.result.current.loading).toBe(true);
  expect(hook.result.current.stale).toBe(true);
  expect(hook.result.current.cachedData).toBe(true);
  expect(hook.result.current.lastUpdatedAt).toBe(Date.parse(preview.freshness!.sourceReadAt));
  await act(async()=>{ if(outcome==='success') read.resolve(fresh); else read.reject(new Error('Azure unavailable')); });
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  if(outcome==='success') {
    expect(hook.result.current.snapshot).toEqual(fresh);
    expect(hook.result.current.lastUpdatedAt).toBe(Date.parse(fresh.freshness!.sourceReadAt));
    expect(hook.result.current.stale).toBe(false);
  } else {
    expect(hook.result.current.snapshot).toEqual(preview);
    expect(hook.result.current.readFailed).toBe(true);
    expect(hook.result.current.stale).toBe(true);
  }
});

it('never replaces a completed fresh read with a late preview', async () => {
  const {preview,fresh} = snapshots(), cached = deferred<MatrixSnapshot>();
  const client = {load:vi.fn(async()=>fresh),loadCached:vi.fn(()=>cached.promise),record:vi.fn()};
  const hook = renderHook(()=>useReleaseMatrix('release',1,10,client,context));
  await waitFor(()=>expect(hook.result.current.snapshot).toEqual(fresh));
  await act(async()=>cached.resolve(preview));
  expect(hook.result.current.snapshot).toEqual(fresh);
  expect(hook.result.current.cachedData).toBe(false);
});

it('does not reconcile an uncertain write from a preview or allow another write before a live read confirms it', async () => {
  const {preview,fresh} = snapshots(), read = deferred<MatrixSnapshot>();
  const client = {load:vi.fn(()=>read.promise),loadCached:vi.fn(async()=>fresh),record:vi.fn(async()=>{throw new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Unconfirmed',{runId:10});})};
  const target = {planId:1,contextIdentity:context,suiteId:22,workItemId:100,pointId:7,outcome:'Passed' as const};
  const store = getMatrixMutationStore(client,'release',1,context);
  await store.record(target);
  const hook = renderHook(()=>useReleaseMatrix('release',1,10,client,context));
  await waitFor(()=>expect(hook.result.current.snapshot).not.toBeNull());
  expect(store.getSnapshot().blocked.has('22:100')).toBe(true);
  await act(()=>hook.result.current.record(target));
  expect(client.record).toHaveBeenCalledOnce();
  await act(async()=>read.resolve(fresh));
  await waitFor(()=>expect(store.getSnapshot().blocked.size).toBe(0));
  expect(hook.result.current.stale).toBe(false);
  expect(preview.projections[0].lastOutcome).toBe('Failed');
});
