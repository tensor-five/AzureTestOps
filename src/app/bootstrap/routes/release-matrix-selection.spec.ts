import {expect,it,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {AdoRuntime} from '../../composition/runtime.js';
import type {SetRepositoryPort} from '../../../application/ports/set-repository.port.js';
import {registerReleaseMatrixRoutes} from './release-matrix-routes.js';
import {matrixTestServices} from '../../../../tests/fixtures/release-matrix.js';
it.each(['bad-json','{}','[0]','[-1]','[1.5]','["20"]'])('rejects invalid versions before Azure reads: %s',async versions=>{
 const {services,azure}=matrixTestServices();const matrixServices=vi.fn(()=>services);
 const route=registerReleaseMatrixRoutes({matrixServices,resolveContext:async()=>({organization:'org',project:'project'})} as unknown as AdoRuntime,{getById:async()=>({id:'one',planId:'1'})} as unknown as SetRepositoryPort);
 let status=0;const res={set statusCode(value:number){status=value;},setHeader(){},end(){}} as unknown as ServerResponse;
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{const path='/phase2/sets/one/release-matrix';await route('GET',path,{url:`${path}?versions=${encodeURIComponent(versions)}`} as IncomingMessage,res);expect(status).toBe(400);expect(azure.reads).toHaveLength(0);expect(matrixServices).not.toHaveBeenCalled();}finally{log.mockRestore();}
});
