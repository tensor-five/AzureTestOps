import type { TestCatalogPort } from '../ports/test-catalog.port.js';
import type { TestManagementReadPort } from '../ports/test-management.port.js';
import type { TestCaseTagsPort } from '../ports/test-case-tags.port.js';
import { mapConcurrent } from '../../shared/utils/concurrency.js';
import { uniqueTags } from '../../domain/release-matrix/matrix-config.js';
import { flattenSuiteTree } from '../../domain/test-management/test-suite-tree.js';

/** A complete plan tag facet needs memberships and tags, never executions or projections. */
export async function loadMatrixTagCatalog(planId: number, deps: { testCatalog: TestCatalogPort;
  testManagement: Pick<TestManagementReadPort, 'listTestCasesInSuite' | 'loadSuiteTree'>; caseTags: TestCaseTagsPort }, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const suites = await deps.testCatalog.listSuitesForPlan(planId);
  const knownIds = new Set(suites.map(suite => suite.id));
  const suiteIds = new Set<number>();
  for (const root of suites.filter(suite => suite.parentSuiteId === null || !knownIds.has(suite.parentSuiteId))) {
    if (suiteIds.has(root.id)) continue;
    signal?.throwIfAborted();
    for (const suite of flattenSuiteTree(await deps.testManagement.loadSuiteTree(planId, root.id))) suiteIds.add(suite.id);
  }
  if ([...knownIds].some(id => !suiteIds.has(id))) throw new Error('Suite-Baum für den Tagkatalog ist unvollständig.');
  const memberships = await mapConcurrent([...suiteIds], 8, suite => deps.testManagement.listTestCasesInSuite(planId, suite), signal);
  const ids = [...new Set(memberships.flat())];
  if (!ids.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Ungültige Testfall-Zugehörigkeit im Tagkatalog.');
  signal?.throwIfAborted();
  const tagsByCase = await deps.caseTags.loadTags(ids);
  signal?.throwIfAborted();
  if (ids.some(id => !tagsByCase.has(id))) throw new Error('Tagkatalog unvollständig: Testfälle konnten nicht gelesen werden.');
  return uniqueTags([...tagsByCase.values()].flat()).sort((a, b) => a.localeCompare(b));
}
