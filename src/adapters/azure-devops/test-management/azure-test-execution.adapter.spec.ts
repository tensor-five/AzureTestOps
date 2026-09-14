import {describe,it,expect,vi} from 'vitest';
import {AzureTestExecutionAdapter} from './azure-test-execution.adapter.js';
const context={organization:'org',project:'project'};
describe('Azure manual execution transport',()=>{
  it('uses JSON patches for test runs and never retries a failed creation',async()=>{
    const patch=vi.fn(async()=>({status:200,json:{}}));const post=vi.fn(async()=>({status:400,json:{}}));
    const adapter=new AzureTestExecutionAdapter({get:vi.fn(),patch,post},context);
    await expect(adapter.createManualRun(1,10)).rejects.toThrow('HTTP 400');expect(post).toHaveBeenCalledTimes(1);
    await adapter.completeResult(100,1,'Passed');expect(patch).toHaveBeenCalledWith(expect.stringContaining('/100/results?'),expect.arrayContaining([expect.objectContaining({id:1,state:'Completed',outcome:'Passed'})]),{'content-type':'application/json'});
  });
  it('rejects missing transport and invalid returned IDs',async()=>{
    const readOnly=new AzureTestExecutionAdapter({get:vi.fn()},context);await expect(readOnly.createManualRun(1,10)).rejects.toThrow('nicht verfügbar');await expect(readOnly.completeRun(100)).rejects.toThrow('nicht verfügbar');
    const adapter=new AzureTestExecutionAdapter({get:vi.fn(),post:async()=>({status:200,json:{id:'bad'}})},context);await expect(adapter.createManualRun(1,10)).rejects.toThrow('Durchlauf-ID');
  });
});
