import type { TestPoint } from '../../domain/test-management/test-point.js';
import type { TestRun } from '../../domain/test-management/test-run.js';
import type { TestResult } from '../../domain/test-management/test-result.js';

export type ConfirmableTestResult = TestResult & { state: string };
/** Narrow reads for validating and confirming a single outcome write. */
export interface TestOutcomeReadPort {
  isCaseInSuite(planId: number, suiteId: number, workItemId: number): Promise<boolean>;
  /** All configurations for this case, not merely the requested point. */
  loadPointsForCase(planId: number, suiteId: number, workItemId: number): Promise<TestPoint[]>;
  loadRun(runId: number): Promise<TestRun | null>;
  loadResult(runId: number, resultId: number): Promise<ConfirmableTestResult | null>;
  /** Only used to identify the result of the newly created single-point run. */
  loadResultsForRun(runId: number): Promise<TestResult[]>;
}
