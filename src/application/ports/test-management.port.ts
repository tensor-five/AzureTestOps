import type { TestPoint } from "../../domain/test-management/test-point.js";
import type { TestResult } from "../../domain/test-management/test-result.js";
import type { TestRun } from "../../domain/test-management/test-run.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";

/**
 * Boundary contract for read-only access to the Azure DevOps Test Management
 * API (`/_apis/test/*`). Adapters implement transport, paging, retry/backoff
 * and DTO → domain mapping; the use case layer stays Azure-agnostic.
 */
export interface TestManagementReadPort {
  /**
   * Loads the suite hierarchy under (and including) the given root suite.
   * Implementations must populate `path` (slash-separated, root-anchored)
   * and `parentSuiteId`. Returns the root node with its descendants.
   */
  loadSuiteTree(planId: number, rootSuiteId: number): Promise<TestSuiteNode>;

  /** Returns the work-item ids that belong to the given suite. */
  listTestCasesInSuite(planId: number, suiteId: number): Promise<number[]>;

  /** Returns all Test Points for the given suite (with continuation paging). */
  loadPointsForSuite(planId: number, suiteId: number): Promise<TestPoint[]>;

  /** Returns all Test Runs that belong to the given Plan (with skip/top paging). */
  listRunsForPlan(planId: number): Promise<TestRun[]>;

  /** Returns all Test Results for the given Run (with skip/top paging). */
  loadResultsForRun(runId: number): Promise<TestResult[]>;
}
