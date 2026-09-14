import {describe,it,expect} from 'vitest';
import {recordMatrixOutcome} from './record-matrix-outcome.use-case.js';
import {matrixTestServices} from '../../../tests/fixtures/release-matrix.js';
import type {MatrixOutcomeTarget} from '../dto/release-matrix.dto.js';
const target:MatrixOutcomeTarget={planId:1,suiteId:21,workItemId:201,pointId:21201,outcome:'Blocked'};
describe('Manual matrix execution',()=>{
  it('creates one completed isolated run and confirms its identity through the existing reader',async()=>{
    const {services,azure}=matrixTestServices();const old=structuredClone(azure.results);
    const result=await recordMatrixOutcome(target,services);
    expect(result.runId).toBe(100);expect(result.projection).toMatchObject({suiteId:21,workItemId:201,lastOutcome:'Blocked',lastRunId:100});
    expect(azure.results.slice(0,old.length)).toEqual(old);expect(azure.runs.at(-1).state).toBe('Completed');
  });
  it.each([{...target,pointId:22201},{...target,suiteId:23,workItemId:302,pointId:23302},{...target,suiteId:23,workItemId:304,pointId:23304},{...target,outcome:'NotRun'}])('rejects an ambiguous, stale or invalid target before creating a run',async input=>{
    const {services,azure}=matrixTestServices();await expect(recordMatrixOutcome(input as MatrixOutcomeTarget,services)).rejects.toThrow();expect(azure.writes).toHaveLength(0);
  });
  it('discloses a created run after completion fails without retrying its creation',async()=>{
    const {services,azure}=matrixTestServices();azure.control.failAfterCreate=true;
    await expect(recordMatrixOutcome(target,services)).rejects.toThrow(/100.*nicht bestätigt/);expect(azure.writes.filter(w=>w.method==='POST')).toHaveLength(1);
  });
  it('does not accept a stale result even when it has the requested outcome',async()=>{
    const {services,azure}=matrixTestServices();azure.control.hideNewResults=true;
    await expect(recordMatrixOutcome({...target,outcome:'Failed'},services)).rejects.toThrow(/nicht bestätigt/);
  });
});
