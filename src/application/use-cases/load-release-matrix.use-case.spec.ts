import {describe,it,expect} from 'vitest';
import {loadReleaseMatrix} from './load-release-matrix.use-case.js';
import {matrixTestServices} from '../../../tests/fixtures/release-matrix.js';
import type {TestSuiteNode} from '../../domain/test-management/test-suite-tree.js';
import {recordMatrixOutcome} from './record-matrix-outcome.use-case.js';
describe('Release matrix read model',()=>{
  it('distinguishes a completed result from an unfinished run without an additional run-list read',async()=>{
    const {services,azure}=matrixTestServices();
    const completeRun=services.execution.completeRun.bind(services.execution);
    services.execution.completeRun=async()=>{throw new Error('Run completion failed');};
    await expect(recordMatrixOutcome({planId:1,suiteId:21,workItemId:201,pointId:21201,outcome:'Passed'},services)).rejects.toThrow('Durchlauf 100');
    expect(azure.runs.find(run=>run.id===100)?.state).toBe('InProgress');
    const runReads=()=>azure.reads.filter(url=>new URL(url).pathname.endsWith('/runs')).length;
    const before=runReads(),partial=await loadReleaseMatrix(1,services);
    const projection=partial.projections.find(p=>p.suiteId===21&&p.workItemId===201)!;
    expect(projection.lastRunId).toBe(100);expect(projection.lastResultCompletedDate).not.toBeNull();
    expect(partial.completedRunIds).toEqual([1]);expect(runReads()-before).toBe(1);
    await completeRun(100);
    const confirmed=await loadReleaseMatrix(1,services);
    expect(confirmed.completedRunIds).toEqual([1,100]);expect(runReads()-before).toBe(2);
  });

  it('returns no completed run IDs when the existing run list is empty',async()=>{
    const {services,azure}=matrixTestServices();azure.runs.splice(0);azure.results.splice(0);
    const snapshot=await loadReleaseMatrix(1,services);expect(snapshot.completedRunIds).toEqual([]);
    expect(azure.reads.filter(url=>new URL(url).pathname.endsWith('/runs'))).toHaveLength(1);
  });

  it('returns raw point evidence for current projections without duplicating reads or transmitting older history',async()=>{
    const {services,azure}=matrixTestServices();
    const result=azure.results.find(r=>r.testSuite.id===21&&r.testCase.id===201)!;
    azure.runs.push({id:2,plan:{id:1},name:'Older history',state:'Completed',isAutomated:false});
    azure.results.push({...result,id:20,testRun:{id:2},completedDate:'2026-08-01T10:00:00Z'});
    const snapshot=await loadReleaseMatrix(1,services);
    expect(snapshot.resultEvidence).toContainEqual(expect.objectContaining({runId:1,workItemId:201,suiteId:21,pointId:21201,outcome:'Failed'}));
    expect(snapshot.resultEvidence?.some(r=>r.runId===2)).toBe(false);
    for(const run of [1,2])expect(azure.reads.filter(url=>new URL(url).pathname.toLowerCase().endsWith(`/runs/${run}/results`))).toHaveLength(1);
  });
  it('does not depend on Suite Work Item tags',async()=>{
    const {services,azure}=matrixTestServices();azure.control.failSuiteTags=true;
    const snapshot=await loadReleaseMatrix(1,services);
    expect(snapshot.projections.length).toBeGreaterThan(0);expect(azure.suiteReads).toEqual([]);
    expect(snapshot.suites[0]).not.toHaveProperty('tags');
  });
  it('rejects a catalog suite missing from the complete tree before presenting partial results',async()=>{
    const {services}=matrixTestServices();const original=services.testManagement.loadSuiteTree.bind(services.testManagement);
    const omit=(node:TestSuiteNode):TestSuiteNode=>({...node,children:node.children.filter(child=>child.id!==44).map(omit)});
    services.testManagement.loadSuiteTree=async(p,r)=>omit(await original(p,r));
    await expect(loadReleaseMatrix(1,services)).rejects.toThrow('Suite-Baum unvollständig: Suite #44');
  });
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
