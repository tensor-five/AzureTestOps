import {afterEach,describe,expect,it,vi} from 'vitest';
import {requestWithRetry} from './retry.js';
import {mapConcurrent} from './concurrency.js';
afterEach(()=>vi.useRealTimers());
describe('cancelled read work',()=>{
  it('starts no request when already aborted',async()=>{
    const c=new AbortController();c.abort();const request=vi.fn();
    await expect(requestWithRetry(request,{signal:c.signal})).rejects.toMatchObject({name:'AbortError'});expect(request).not.toHaveBeenCalled();
  });
  it('cancels Retry-After waiting without another HTTP attempt or remaining timer',async()=>{
    vi.useFakeTimers();const c=new AbortController(),request=vi.fn(async()=>({status:429,headers:{'retry-after':'60'}}));
    const pending=requestWithRetry(request,{signal:c.signal});const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(1);expect(vi.getTimerCount()).toBe(1);c.abort();await rejected;
    expect(vi.getTimerCount()).toBe(0);expect(request).toHaveBeenCalledOnce();
  });
  it.each(['abort','failure'])('drains started workers and never starts queued work after %s',async mode=>{
    const c=new AbortController();let finish!:(v:number)=>void,fail!:(e:Error)=>void;const started:number[]=[];
    const pending=mapConcurrent([1,2,3,4],2,async id=>{started.push(id);if(id===1)return new Promise<number>((yes,no)=>{fail=no;c.signal.addEventListener('abort',()=>no(c.signal.reason));});return new Promise<number>(yes=>{finish=yes;});},c.signal);
    let settled=false;const observed=pending.catch(error=>{settled=true;return error;});
    if(mode==='abort')c.abort();else fail(new Error('Failed'));
    await Promise.resolve();await Promise.resolve();expect(settled).toBe(false);expect(started).toEqual([1,2]);
    finish(2);await observed;expect(settled).toBe(true);expect(started).toEqual([1,2]);
  });
});
