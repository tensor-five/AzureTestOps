import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../domain/test-management/test-plan.js";
import type { TestCatalogClientPort } from "../../application/ports/client/test-catalog-client.port.js";
import { jsonFetch } from "./json-fetch.js";

/**
 * HTTP adapter implementing {@link TestCatalogClientPort} against the local
 * server's `/phase2/test-plans` and `/phase2/test-plans/:planId/suites`
 * endpoints.
 */
export class HttpTestCatalogAdapter implements TestCatalogClientPort {
  public async listTestPlans(): Promise<TestPlanSummary[]> {
    const payload = await jsonFetch<{ plans: TestPlanSummary[] }>("/phase2/test-plans", {
      method: "GET"
    });
    return payload.plans;
  }

  public async listSuitesForPlan(planId: number): Promise<TestSuiteSummary[]> {
    const payload = await jsonFetch<{ suites: TestSuiteSummary[] }>(
      `/phase2/test-plans/${planId}/suites`,
      { method: "GET" }
    );
    return payload.suites;
  }
}
