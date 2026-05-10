import type { IncomingMessage, ServerResponse } from "node:http";

import type { AdoRuntime } from "../../composition/runtime.js";

import { errorPayload, writeJson } from "./route-helpers.js";

export type CatalogRouter = (
  method: string,
  pathname: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

const TEST_PLANS_PATH = "/phase2/test-plans";
const TEST_PLAN_SUITES_PATTERN = /^\/phase2\/test-plans\/(\d+)\/suites$/;
const SAVED_QUERIES_PATH = "/phase2/saved-queries";

/**
 * Read-only catalog endpoints used by the Set-creation dialog (plans / suites
 * / shared queries). All routes require a configured ADO context — failures
 * surface a 412 so the UI can prompt the user to fill it in.
 */
export function registerCatalogRoutes(ado: AdoRuntime): CatalogRouter {
  return async (method, pathname, _url, _req, res) => {
    if (method !== "GET") {
      return false;
    }

    if (pathname === TEST_PLANS_PATH) {
      try {
        const catalog = await ado.testCatalog();
        const plans = await catalog.listTestPlans();
        writeJson(res, 200, { plans });
      } catch (error) {
        writeContextOrServerError(res, error, "TEST_PLANS_FAILED");
      }
      return true;
    }

    if (pathname === SAVED_QUERIES_PATH) {
      try {
        const queriesPort = await ado.savedQuery();
        const queries = await queriesPort.listSavedQueries();
        writeJson(res, 200, { queries });
      } catch (error) {
        writeContextOrServerError(res, error, "SAVED_QUERIES_FAILED");
      }
      return true;
    }

    const planSuitesMatch = pathname.match(TEST_PLAN_SUITES_PATTERN);
    if (planSuitesMatch) {
      const planId = Number.parseInt(planSuitesMatch[1], 10);
      if (!Number.isFinite(planId) || planId <= 0) {
        writeJson(res, 400, { code: "INVALID_PLAN_ID", message: "planId must be a positive integer." });
        return true;
      }
      try {
        const catalog = await ado.testCatalog();
        const suites = await catalog.listSuitesForPlan(planId);
        writeJson(res, 200, { suites });
      } catch (error) {
        writeContextOrServerError(res, error, "TEST_SUITES_FAILED");
      }
      return true;
    }

    return false;
  };
}

function writeContextOrServerError(res: ServerResponse, error: unknown, fallback: string): void {
  if (
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "ADO_CONTEXT_NOT_CONFIGURED"
  ) {
    writeJson(res, 412, {
      code: "ADO_CONTEXT_NOT_CONFIGURED",
      message: "Configure organization and project under /phase2/ado-context first."
    });
    return;
  }
  writeJson(res, 500, errorPayload(error, fallback));
}
