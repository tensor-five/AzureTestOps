import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { build } from 'esbuild';
import { buildRuntime } from '../../../src/app/composition/runtime.js';
import { createHttpServer } from '../../../src/app/bootstrap/http-server.js';
import { makeAzureFixture, matrixConfig } from './azure-fixture.js';

export async function startMatrixServer() {
  const directory=await mkdtemp(path.join(tmpdir(),'release-matrix-'));
  const bundle=path.join(directory,'src/app/bootstrap/local-ui-entry.browser.js');await mkdir(path.dirname(bundle),{recursive:true});
  await build({entryPoints:['src/app/bootstrap/local-ui-entry.ts'],bundle:true,format:'esm',platform:'browser',outfile:bundle});
  let azure=makeAzureFixture();
  const client={get:(url:string)=>azure.client.get(url),patch:(url:string,body:unknown)=>azure.client.patch(url,body),post:(url:string,body:unknown)=>azure.client.post(url,body)};
  const file=path.join(directory,'preferences.json');
  let runtime=buildRuntime({userPreferencesFilePath:file,localUserId:'contract',httpClient:client});
  const reserve=createNetServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));const port=(reserve.address() as {port:number}).port;await new Promise<void>(r=>reserve.close(()=>r()));
  const boot=()=>createHttpServer({port,distRootPath:directory,deps:{...runtime,preflight:{check:async()=>({status:'READY'})}}});
  let server=boot();
  async function reset(config:unknown=matrixConfig){azure=makeAzureFixture();await runtime.userPreferences.updatePreferences(()=>({themeMode:'light',adoContext:{organization:'contract-org',project:'contract-project'},activeSetId:'matrix-set',sets:[{id:'matrix-set',name:'Matrix Set',planId:'1',rootSuiteId:'1',queryId:'empty'},{id:'other-set',name:'Other Set',planId:'1',rootSuiteId:'1',queryId:'empty'}],setReleaseMatrices:{'matrix-set':structuredClone(config)}} as any));}
  await reset();
  return {origin:`http://127.0.0.1:${port}`,reset,azure:()=>azure,seed:async(config:unknown)=>runtime.userPreferences.mergePreferences({setReleaseMatrices:{'matrix-set':config}} as any),patch:async(value:any)=>runtime.userPreferences.mergePreferences(value),disk:()=>readFile(file,'utf8'),restart:async()=>{await server.close();runtime=buildRuntime({userPreferencesFilePath:file,localUserId:'contract',httpClient:client});server=boot();},close:async()=>{await server.close();await rm(directory,{recursive:true,force:true});}};
}
