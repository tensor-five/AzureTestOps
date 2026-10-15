import type { TestRun } from '../../domain/test-management/test-run.js';
import type { TestResult } from '../../domain/test-management/test-result.js';
import type { DataFreshness } from '../dto/data-freshness.dto.js';
import type { TestManagementReadPort } from './test-management.port.js';

export type PlanTestResults = { runs: TestRun[]; results: TestResult[]; freshness: DataFreshness };
export type TestResultHistoryReadOptions = {
  testManagement: TestManagementReadPort;
  concurrency?: number;
  signal?: AbortSignal;
};

/** Context-scoped history reader. Every call enumerates current runs before reusing completed results. */
export interface TestResultHistoryPort {
  loadPlanResults(planId: number, options: TestResultHistoryReadOptions): Promise<PlanTestResults>;
}
