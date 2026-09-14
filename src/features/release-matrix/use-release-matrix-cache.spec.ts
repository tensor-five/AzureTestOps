// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {useReleaseMatrix} from './use-release-matrix.js';
import {emptyMatrixConfig} from '../../domain/release-matrix/matrix-config.js';
import type {MatrixSnapshot} from '../../application/dto/release-matrix.dto.js';
import {ApiError} from '../../application/dto/api-error.js';
import {matrixProjection} from '../../../tests/fixtures/matrix-hierarchy.js';
vi.mock('./matrix-preference-store.js',()=>({matrixPreferenceStore:{load:()=>null,save:vi.fn()}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const context='https://dev.azure.com/org/project';
function fixture(){
 const snapshot:MatrixSnapshot={planId:1,contextIdentity:context,suites:[],projections:[],pointCounts:{},suiteMemberships:{}};
 const port={load:vi.fn(async()=>snapshot),record:vi.fn()};
 const mount=async(set='one',plan=1,ctx:string|undefined=context)=>{const hook=renderHook(()=>useReleaseMatrix(set,plan,10,port,ctx));await waitFor(()=>expect(hook.result.current.loading).toBe(false));return hook;};
 return {snapshot,port,mount};
}
describe('matrix navigation and selection reads',()=>{
 it.each(['Passed','ResetToActive'] as const)('rereads older selection caches after a fresh read confirms an uncertain %s',async outcome=>{
  const initial={...matrixProjection(22,100),testPointId:7,lastOutcome:'Failed',lastRunId:2,lastResultId:3};
  const baseline:MatrixSnapshot={planId:1,contextIdentity:context,suites:[],projections:[initial],pointCounts:{'22:100':1}};
  const isReset=outcome==='ResetToActive';
  const updated={...initial,lastOutcome:isReset?'Unspecified':'Passed',lastRunId:isReset?null:10,lastResultId:isReset?null:11};
  const confirmed:MatrixSnapshot={...baseline,projections:[updated],completedRunIds:[10],
   activePoints:isReset?[{suiteId:22,workItemId:100,pointId:7}]:[],
   resultEvidence:[{runId:10,resultId:11,suiteId:22,workItemId:100,pointId:7,outcome:'Passed',completedDate:'2026-09-14T10:00:00Z'}]};
  let current=baseline;
  const port={load:vi.fn(async()=>current),record:vi.fn(async()=>{throw new ApiError(500,isReset?'MATRIX_RESET_UNCONFIRMED':'MATRIX_RUN_UNCONFIRMED','Nicht bestätigt',isReset?{pointId:7}:{runId:10});})};
  const hook=renderHook(()=>useReleaseMatrix('catalog',1,10,port,context));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  const select=async(ids:number[])=>{
   act(()=>hook.result.current.update({columns:ids.map(id=>({id:String(id),versionSuiteId:id,visible:true}))}));
   await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  };
  await select([20]);await select([20,30]);await select([20]);
  expect(port.load).toHaveBeenCalledTimes(3); // Both selections are cached.
  await act(()=>hook.result.current.record({planId:1,contextIdentity:context,suiteId:22,workItemId:100,pointId:7,outcome}));
  expect(hook.result.current.blocked.has('22:100')).toBe(true);
  current=confirmed;
  await select([20,30]);
  expect(hook.result.current.blocked.size).toBe(0);
  expect(hook.result.current.snapshot?.projections[0].lastOutcome).toBe(updated.lastOutcome);
  expect(port.load).toHaveBeenCalledTimes(4);
  await select([20]);
  expect(port.load).toHaveBeenCalledTimes(5); // The prior selection cannot revive the failed status.
  expect(hook.result.current.snapshot?.projections[0].lastOutcome).toBe(updated.lastOutcome);
  expect(port.record).toHaveBeenCalledTimes(1);
 });
 it('reuses a recent snapshot on return, but explicit refresh always reads',async()=>{
  const f=fixture(),first=await f.mount();first.unmount();const next=await f.mount();expect(f.port.load).toHaveBeenCalledTimes(1);
  await act(()=>next.result.current.reload());expect(f.port.load).toHaveBeenCalledTimes(2);
 });
 it('expires navigation snapshots sixty seconds after the actual load',async()=>{
  let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);const f=fixture();(await f.mount()).unmount();now+=60000;await f.mount();expect(f.port.load).toHaveBeenCalledTimes(2);
 });
 it('never shares snapshots across sets, plans or Azure contexts',async()=>{
  const f=fixture();(await f.mount()).unmount();(await f.mount('two')).unmount();(await f.mount('one',2)).unmount();await f.mount('one',1,'another');expect(f.port.load).toHaveBeenCalledTimes(4);
 });
 it('invalidates a previous success when an explicit refresh fails',async()=>{
  const f=fixture(),first=await f.mount();f.port.load.mockRejectedValueOnce(new Error('offline'));await act(()=>first.result.current.reload());first.unmount();await f.mount();expect(f.port.load).toHaveBeenCalledTimes(3);
 });
 it('loads newly selected versions, ignores superseded replies and keeps cosmetic filters local',async()=>{
  const f=fixture(),hook=await f.mount();let finish!:(value:MatrixSnapshot)=>void;
  f.port.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  act(()=>hook.result.current.update({columns:[{id:'a',versionSuiteId:20,visible:true}]}));
  await waitFor(()=>expect(f.port.load).toHaveBeenCalledTimes(2));const obsolete=f.port.load.mock.calls[1] as unknown as [string,AbortSignal,number[]];
  expect(obsolete[2]).toEqual([20]);
  act(()=>hook.result.current.update({columns:[{id:'b',versionSuiteId:30,visible:true}]}));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));expect(obsolete[1].aborted).toBe(true);
  await act(async()=>finish({...f.snapshot,planId:999}));expect(hook.result.current.snapshot?.planId).toBe(1);
  act(()=>hook.result.current.update({...emptyMatrixConfig(1,10),search:'abc',tagFilter:'Regression',grouping:'content',columns:[{id:'b',versionSuiteId:30,visible:false}]}));
  expect(f.port.load).toHaveBeenCalledTimes(3);
 });
});
