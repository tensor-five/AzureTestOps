import { expect, it, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { AzureTestCaseTagsAdapter } from '../../adapters/azure-devops/test-management/azure-test-case-tags.adapter.js';
import { loadMatrixTagCatalog } from './load-matrix-tag-catalog.use-case.js';

it('loads every plan tag, including cases outside selected versions, without executions or duplicate hydration', async () => {
  const { azure, services } = matrixTestServices();
  const caseTags = new AzureTestCaseTagsAdapter(azure.client, { organization: 'contract-org', project: 'contract-project' });
  const tags = await loadMatrixTagCatalog(1, { ...services, caseTags });
  expect(tags).toEqual(['2.1.0-Test', 'Data Import', 'Regress', 'Regression']);
  expect(azure.reads.some(url => /\/(points|runs|results)(?:[/?]|$)/i.test(url))).toBe(false);
  const hydration = azure.reads.filter(url => url.includes('/wit/workitems?'));
  expect(hydration).toHaveLength(1);
  const url = new URL(hydration[0]);
  expect(url.searchParams.get('fields')).toBe('System.Tags,System.WorkItemType');
  const ids = url.searchParams.get('ids')!.split(',');
  expect(ids.length).toBe(new Set(ids).size);
  expect(azure.writes).toEqual([]);
});

it('does not start Azure reads after cancellation', async () => {
  const { services } = matrixTestServices();
  const catalog = vi.spyOn(services.testCatalog, 'listSuitesForPlan');
  const controller = new AbortController(); controller.abort();
  await expect(loadMatrixTagCatalog(1, { ...services, caseTags: { loadTags: vi.fn() } }, controller.signal)).rejects.toThrow();
  expect(catalog).not.toHaveBeenCalled();
});
it.each(['missing-suite','invalid-membership','missing-tags'])('refuses an incomplete tag catalogue rather than showing misleading options: %s',async issue=>{
 const {services}=matrixTestServices();
 const caseTags={loadTags:vi.fn(async()=>new Map<number,string[]>())};
 if(issue==='missing-suite')vi.spyOn(services.testManagement,'loadSuiteTree').mockResolvedValue({id:1,name:'Root',parentSuiteId:null,path:'Root',children:[]});
 if(issue==='invalid-membership')vi.spyOn(services.testManagement,'listTestCasesInSuite').mockResolvedValue([-1]);
 await expect(loadMatrixTagCatalog(1,{...services,caseTags})).rejects.toThrow(/unvollständig|Ungültige/);
});
