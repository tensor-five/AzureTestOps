import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../../domain/test-management/test-plan.js";

/**
 * Browser-facing read port for the Test Plan / Suite catalog used by the
 * Set-creation dialog. Mirrors {@link import("../test-catalog.port.js").TestCatalogPort}
 * 1:1 — the wire shape happens to match the domain summary, so no DTO is
 * needed.
 */
export interface TestCatalogClientPort {
  listTestPlans(): Promise<TestPlanSummary[]>;
  listSuitesForPlan(planId: number): Promise<TestSuiteSummary[]>;
}
