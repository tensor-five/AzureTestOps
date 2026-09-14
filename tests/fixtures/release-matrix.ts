import { makeAzureFixture } from '../e2e/release-matrix-v2/azure-fixture.js';
import { AzureTestManagementAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-management.adapter.js';
import { AzureTestExecutionAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-execution.adapter.js';
import { AzureTestOutcomeReadAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-outcome-read.adapter.js';
import { AzureTestCatalogAdapter } from '../../src/adapters/azure-devops/test-management/azure-test-catalog.adapter.js';
import { AzureWorkItemHydrationAdapter } from '../../src/adapters/azure-devops/work-items/azure-work-item-hydration.adapter.js';
import { WorkItemBackedTestCaseHydrationAdapter } from '../../src/adapters/azure-devops/test-management/work-item-backed-test-case-hydration.adapter.js';
export function matrixTestServices() {
  const azure=makeAzureFixture();const context={organization:'contract-org',project:'contract-project'};
  return {azure,services:{testManagement:new AzureTestManagementAdapter(azure.client,context),testCatalog:new AzureTestCatalogAdapter(azure.client,context),testCaseHydration:new WorkItemBackedTestCaseHydrationAdapter(new AzureWorkItemHydrationAdapter(azure.client,context)),execution:new AzureTestExecutionAdapter(azure.client,context),outcomeRead:new AzureTestOutcomeReadAdapter(azure.client,context)}};
}
