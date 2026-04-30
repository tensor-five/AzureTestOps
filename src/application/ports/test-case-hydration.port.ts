import type { TestCaseHydrationData } from "../../domain/test-management/test-case-hydration-data.js";

/**
 * Boundary contract for fetching the work-item-shaped data a Test Management
 * use case needs to materialize {@link TestCaseHydrationData}.
 *
 * Separate from {@link WorkItemHydrationPort} so the Test Management bounded
 * context never imports the Work Items domain entity. Implementations are
 * free to delegate to a Work Items hydration adapter — projection happens at
 * the composition root, not inside the use case.
 */
export interface TestCaseHydrationPort {
  /**
   * Returns hydrated test-case-shaped data keyed by work item id. Items the
   * upstream source did not return are simply absent — call sites treat
   * absence as partial-failure rather than a hard error.
   */
  hydrateTestCases(ids: number[]): Promise<Map<number, TestCaseHydrationData>>;
}
