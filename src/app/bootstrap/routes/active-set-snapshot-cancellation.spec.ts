import {EventEmitter} from 'node:events';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect,it,vi} from 'vitest';
import {buildRuntime} from '../../composition/runtime.js';
import {registerActiveSetSnapshotStreamRoute} from './active-set-snapshot-route.js';
import type {AzureRestHttpClient,AzureHttpResponse} from '../../../shared/azure-devops/azure-rest-client.js';
it('aborts request-scoped Azure reads on SSE close and starts a later stream with a fresh signal',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'snapshot-abort-'));
 const signals:AbortSignal[]=[];
 const client:AzureRestHttpClient={get:vi.fn(async(_url,options)=>{
   const signal=options!.signal!;signals.push(signal);
   return new Promise<AzureHttpResponse>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 })};
 try{
  const runtime=buildRuntime({userPreferencesFilePath:path.join(directory,'preferences.json'),httpClient:client});
  await runtime.adoContext.setContext({organization:'org',project:'project'});
  const set=await runtime.setRepository.create({name:'Scope',planId:'1',rootSuiteId:'1',queryId:'query'});
  const route=registerActiveSetSnapshotStreamRoute(runtime);
  for(let round=0;round<2;round++){
   const res=Object.assign(new EventEmitter(),{writableEnded:false,destroyed:false,statusCode:0,setHeader:vi.fn(),flushHeaders:vi.fn(),write:vi.fn(),end:vi.fn()});
   const start=signals.length;
   const pending=route('GET','/phase2/active-set/snapshot/stream',new URL(`http://local/phase2/active-set/snapshot/stream?setId=${set.id}`),{} as IncomingMessage,res as unknown as ServerResponse);
   await vi.waitFor(()=>expect(signals.length).toBe(start+2));
   expect(signals[start].aborted).toBe(false);expect(signals[start]).toBe(signals[start+1]);
   if(round)expect(signals[start]).not.toBe(signals[0]);
   const writes=res.write.mock.calls.length;res.destroyed=true;res.emit('close');await pending;
   expect(signals[start].aborted).toBe(true);expect(signals.length).toBe(start+2);expect(res.write.mock.calls.length).toBe(writes);expect(res.end).not.toHaveBeenCalled();
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
