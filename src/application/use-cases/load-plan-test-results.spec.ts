import {expect,it,vi} from 'vitest';
import {loadPlanTestResults} from './load-plan-test-results.js';
import {matrixTestServices} from '../../../tests/fixtures/release-matrix.js';
it('keeps every historical result and its stable run ordering for the unchanged aggregator',async()=>{
 const {services}=matrixTestServices();const runs=await services.testManagement.listRunsForPlan(1);
 const results=(await Promise.all(runs.map(run=>services.testManagement.loadResultsForRun(run.runId)))).flat();
 expect(await loadPlanTestResults(1,true,services)).toEqual({runs,results});
});
it('does not enumerate execution history for an empty selection',async()=>{
 const {services}=matrixTestServices(),history=vi.spyOn(services.testManagement,'listRunsForPlan');
 expect(await loadPlanTestResults(1,false,services)).toEqual({runs:[],results:[]});expect(history).not.toHaveBeenCalled();
});
it('does not start history after cancellation',async()=>{
 const {services}=matrixTestServices(),history=vi.spyOn(services.testManagement,'listRunsForPlan');const controller=new AbortController();controller.abort();
 await expect(loadPlanTestResults(1,true,{...services,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(history).not.toHaveBeenCalled();
});
