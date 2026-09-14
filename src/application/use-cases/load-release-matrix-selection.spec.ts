import {describe,expect,it,vi} from 'vitest';
import {makeAzureFixture} from '../../../tests/e2e/release-matrix-v3/azure-fixture.js';
import {AzureTestManagementAdapter} from '../../adapters/azure-devops/test-management/azure-test-management.adapter.js';
import {AzureTestCatalogAdapter} from '../../adapters/azure-devops/test-management/azure-test-catalog.adapter.js';
import {AzureTestOutcomeReadAdapter} from '../../adapters/azure-devops/test-management/azure-test-outcome-read.adapter.js';
import {AzureWorkItemHydrationAdapter} from '../../adapters/azure-devops/work-items/azure-work-item-hydration.adapter.js';
import {WorkItemBackedTestCaseHydrationAdapter} from '../../adapters/azure-devops/test-management/work-item-backed-test-case-hydration.adapter.js';
import {loadReleaseMatrix} from './load-release-matrix.use-case.js';
function fixture(){
 const azure=makeAzureFixture(),context={organization:'contract-org',project:'contract-project'};
 for(const suite of Object.keys(azure.membership))azure.membership[Number(suite)]=azure.membership[Number(suite)].filter(id=>id!==302&&id!==304);
 const deps={testManagement:new AzureTestManagementAdapter(azure.client,context),testCatalog:new AzureTestCatalogAdapter(azure.client,context),outcomeRead:new AzureTestOutcomeReadAdapter(azure.client,context),testCaseHydration:new WorkItemBackedTestCaseHydrationAdapter(new AzureWorkItemHydrationAdapter(azure.client,context))};
 return {azure,deps};
}
describe('selected version reads',()=>{
 it('retains all suite metadata while reading cases and points only for selected direct contents',async()=>{
  const {deps}=fixture();const cases=vi.spyOn(deps.testManagement,'listTestCasesInSuite'),points=vi.spyOn(deps.testManagement,'loadPointsForSuite');
  const data=await loadReleaseMatrix(1,deps,{versionSuiteIds:[20]});
  expect(data.suites.some(s=>s.id===50)).toBe(true);expect(data.projections.length).toBeGreaterThan(0);
  const selected=new Set(data.suites.filter(s=>data.suites.find(e=>e.id===s.parentSuiteId)?.parentSuiteId===20).map(s=>s.id));
  expect(new Set(cases.mock.calls.map(c=>c[1]))).toEqual(selected);expect(new Set(points.mock.calls.map(c=>c[1]))).toEqual(selected);
  expect(new Set(Object.keys(data.suiteMemberships!).map(Number))).toEqual(selected);
 });
 it('reads metadata only when no version is selected',async()=>{
  const {deps}=fixture();const cases=vi.spyOn(deps.testManagement,'listTestCasesInSuite'),history=vi.spyOn(deps.testManagement,'listRunsForPlan'),read=vi.spyOn(deps.outcomeRead,'loadRun');
  const data=await loadReleaseMatrix(1,deps,{versionSuiteIds:[]});expect(data.suites.length).toBeGreaterThan(0);expect(data.projections).toEqual([]);
  expect(cases).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it('keeps the existing physical projections identical to the historical algorithm',async()=>{
  const {deps}=fixture();const fast=await loadReleaseMatrix(1,deps,{versionSuiteIds:[20,30]});
  const legacy=await loadReleaseMatrix(1,deps);
  const selectedIds=new Set(fast.projections.map(p=>p.suiteId));
  legacy.projections=legacy.projections.filter(p=>selectedIds.has(p.suiteId));
  legacy.pointCounts=Object.fromEntries(Object.entries(legacy.pointCounts).filter(([key])=>selectedIds.has(Number(key.split(':')[0]))));
  expect(fast.projections).toEqual(legacy.projections);expect(fast.pointCounts).toEqual(legacy.pointCounts);
 });
});
it('keeps the historical suite outcome independent of unrelated missing points',async()=>{
 const {azure,deps}=fixture();
 azure.results.push({...azure.results.find(r=>r.testSuite.id===22&&r.testCase.id===101),id:900,testPoint:{id:999999},outcome:'Failed',completedDate:'2026-09-03T10:00:00Z'});
 // The physical point can still refer to an older result: preserve the established suite-history rule.
 const original=deps.testManagement.loadPointsForSuite.bind(deps.testManagement);
 vi.spyOn(deps.testManagement,'loadPointsForSuite').mockImplementation(async(plan,suite)=>(await original(plan,suite)).map(p=>p.suiteId===22&&p.workItemId===101?{...p,lastRunId:1,lastResultId:1,lastOutcome:'Passed'}:p));
 const before=await loadReleaseMatrix(1,deps,{versionSuiteIds:[20]});
 azure.membership[22].push(304);
 const after=await loadReleaseMatrix(1,deps,{versionSuiteIds:[20]});
 const projection=(value:typeof before)=>value.projections.find(p=>p.suiteId===22&&p.workItemId===101);
 expect(projection(before)?.lastOutcome).toBe('Failed');expect(projection(after)).toEqual(projection(before));
});
