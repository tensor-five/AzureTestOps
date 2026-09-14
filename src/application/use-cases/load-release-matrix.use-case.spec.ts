import {describe,it,expect} from 'vitest';
import {loadReleaseMatrix} from './load-release-matrix.use-case.js';
import {matrixTestServices} from '../../../tests/fixtures/release-matrix.js';
describe('Release matrix read model',()=>{
  it('uses existing outcomes and deduplicates identical suite occurrences without merging suites',async()=>{
    const {services}=matrixTestServices();const snapshot=await loadReleaseMatrix(1,services);
    expect(snapshot.projections.filter(p=>p.suiteId===11&&p.workItemId===101)).toHaveLength(1);
    expect(snapshot.projections.filter(p=>p.workItemId===201&&[21,22].includes(p.suiteId)).map(p=>p.lastOutcome)).toEqual(['Failed','Passed']);
    expect(snapshot.pointCounts['23:302']).toBe(2);expect(snapshot.pointCounts['23:304']).toBeUndefined();
  });
  it('propagates incomplete membership loads instead of returning a misleading empty matrix',async()=>{
    const {services,azure}=matrixTestServices();azure.control.failSuite=44;
    await expect(loadReleaseMatrix(1,services)).rejects.toThrow();
  });
  it('retains the existing point fallback and actual suite paths',async()=>{
    const {services,azure}=matrixTestServices();azure.control.omitResultSuite=true;
    const snapshot=await loadReleaseMatrix(1,services);
    expect(snapshot.projections.find(p=>p.suiteId===21&&p.workItemId===201)?.lastOutcome).toBe('Failed');
    expect(snapshot.suites.find(s=>s.id===43)?.path).toContain('A > Regression');
  });
});
