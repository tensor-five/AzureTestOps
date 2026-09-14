import {expect,it,vi} from 'vitest';
import {AzureTestCaseTagsAdapter} from './azure-test-case-tags.adapter.js';
const context={organization:'org',project:'project'};
it('batches unique case IDs and requests only tags and work item type',async()=>{
 const get=vi.fn(async(raw:string)=>{const ids=new URL(raw).searchParams.get('ids')!.split(',').map(Number);return {status:200,json:{value:ids.map(id=>({id,fields:{'System.WorkItemType':'Test Case','System.Tags':' Regression ; Import; '}}))}};});
 const adapter=new AzureTestCaseTagsAdapter({get},context),ids=Array.from({length:201},(_,i)=>i+1);
 const result=await adapter.loadTags([...ids,1]);expect(result.size).toBe(201);expect(result.get(1)).toEqual(['Regression','Import']);expect(get).toHaveBeenCalledTimes(2);
 for(const [url] of get.mock.calls){expect(new URL(url).searchParams.get('fields')).toBe('System.Tags,System.WorkItemType');expect(new URL(url).searchParams.get('ids')!.split(',').length).toBeLessThanOrEqual(200);}
});
it.each([{value:[]},{value:[{id:1,fields:{'System.WorkItemType':'Bug'}}]},{value:'invalid'}])('rejects incomplete or invalid tag data %j',async json=>{
 const adapter=new AzureTestCaseTagsAdapter({get:async()=>({status:200,json})},context);await expect(adapter.loadTags([1])).rejects.toThrow();
});
it('does not issue HTTP reads after cancellation or for no IDs',async()=>{
 const controller=new AbortController(),get=vi.fn();const adapter=new AzureTestCaseTagsAdapter({get,signal:controller.signal},context);
 expect(await adapter.loadTags([])).toEqual(new Map());controller.abort();await expect(adapter.loadTags([1])).rejects.toMatchObject({name:'AbortError'});expect(get).not.toHaveBeenCalled();
});
