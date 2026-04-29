/**
 * Domain-side projection of an Azure DevOps Test Point. A Test Point is a
 * `(test case, suite, configuration)` triple — the same Test Case can have
 * multiple Test Points if it lives in several suites or configurations.
 */
export type TestPoint = {
  pointId: number;
  workItemId: number;
  suiteId: number;
  configurationId: number | null;
  configurationName: string | null;
  /** Latest run id observed on this point — may be null when never executed. */
  lastRunId: number | null;
  /** Latest result id observed on this point — may be null when never executed. */
  lastResultId: number | null;
  /**
   * Outcome of the last test run on this point (`Passed`, `Failed`, ...). ADO
   * publishes this directly on the point, so it stays in sync even when a Run
   * was archived or its results endpoint dropped the `testSuite.id` link.
   */
  lastOutcome: string | null;
};
