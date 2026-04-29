import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../domain/test-management/test-plan.js";

/**
 * Read-only catalog of Test Plans and their Suites — surfaces the data the
 * Set-creation dialog needs to populate plan / suite pickers.
 *
 * Kept as a separate port from {@link TestManagementReadPort} because the
 * snapshot loader and the catalog have different consumers (snapshot is per
 * Set; catalog is global) and different paging semantics.
 */
export interface TestCatalogPort {
  /** Returns every Test Plan in the project (paged transparently). */
  listTestPlans(): Promise<TestPlanSummary[]>;

  /**
   * Returns every Suite under the given Plan, flat. Callers (UI) are
   * responsible for assembling a tree if they need one.
   */
  listSuitesForPlan(planId: number): Promise<TestSuiteSummary[]>;
}
