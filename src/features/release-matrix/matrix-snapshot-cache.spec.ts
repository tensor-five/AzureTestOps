import {describe,expect,it} from 'vitest';
import {matrixSnapshotCache} from './matrix-snapshot-cache.js';
import type {ReleaseMatrixClientPort} from '../../application/ports/client/release-matrix-client.port.js';
import type {MatrixSnapshot} from '../../application/dto/release-matrix.dto.js';
const port=()=>({} as ReleaseMatrixClientPort);
const entry={setId:'set',snapshot:{} as MatrixSnapshot,readStartedAt:1,loadedAt:100};
describe('matrix snapshot cache',()=>{
 it('expires at sixty seconds, including backwards clock changes',()=>{const cache=matrixSnapshotCache(port());cache.set('a',entry);expect(cache.get('a',60099)).toBe(entry);expect(cache.get('a',60100)).toBeUndefined();cache.set('a',entry);expect(cache.get('a',99)).toBeUndefined();});
 it('isolates clients and supports explicit invalidation',()=>{const a=matrixSnapshotCache(port()),b=matrixSnapshotCache(port());a.set('x',entry);expect(b.get('x',100)).toBeUndefined();a.invalidate('x');expect(a.get('x',100)).toBeUndefined();});
 it('bounds retained contexts and evicts the least recently used',()=>{const cache=matrixSnapshotCache(port());for(let i=0;i<16;i++)cache.set(String(i),entry);cache.get('0',100);cache.set('16',entry);expect(cache.get('0',100)).toBe(entry);expect(cache.get('1',100)).toBeUndefined();});
 it('invalidates every version selection only within the same physical scope',()=>{
  const cache=matrixSnapshotCache(port());
  const value={...entry,snapshot:{...entry.snapshot,planId:1,contextIdentity:'context'}};
  cache.set('a',value);cache.set('b',value);
  cache.set('other-set',{...value,setId:'other'});
  cache.set('other-plan',{...value,snapshot:{...value.snapshot,planId:2}});
  cache.set('other-context',{...value,snapshot:{...value.snapshot,contextIdentity:'other'}});
  cache.invalidateScope('set',1,'context');
  expect(cache.get('a',100)).toBeUndefined();expect(cache.get('b',100)).toBeUndefined();
  for(const key of ['other-set','other-plan','other-context'])expect(cache.get(key,100)).toBeDefined();
 });
});
