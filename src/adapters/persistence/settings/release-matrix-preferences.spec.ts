import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {LowdbUserPreferencesAdapter} from './lowdb-user-preferences.adapter.js';
import {emptyMatrixConfig} from '../../../domain/release-matrix/matrix-config.js';
describe('Release matrix preference isolation',()=>{
  it('merges one set and preserves the other set and unrelated preferences across restart',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const dir=await mkdtemp(path.join(os.tmpdir(),'matrix-preferences-'));const file=path.join(dir,'preferences.json');
    try{const adapter=new LowdbUserPreferencesAdapter(file,'user');await adapter.mergePreferences({themeMode:'dark',setReleaseMatrices:{first:emptyMatrixConfig(1,10),second:emptyMatrixConfig(2,20)}});
      await adapter.mergePreferences({setReleaseMatrices:{first:{...emptyMatrixConfig(1,10),search:'CSV'}}});
      const saved=await new LowdbUserPreferencesAdapter(file,'user').getPreferences();expect(saved.themeMode).toBe('dark');expect(saved.setReleaseMatrices?.second.planId).toBe(2);expect(saved.setReleaseMatrices?.first.search).toBe('CSV');
      await adapter.mergePreferences({setReleaseMatrices:{first:{}}} as never);expect((await adapter.getPreferences()).setReleaseMatrices?.first).toBeUndefined();expect((await adapter.getPreferences()).setReleaseMatrices?.second).toBeDefined();
    }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
  });
});
