import { describe, expect, it, vi } from "vitest";

import type { TestCatalogPort } from "../../../application/ports/test-catalog.port.js";
import type { SavedQueryPort } from "../../../application/ports/saved-query.port.js";
import type { AdoRuntime } from "../../composition/runtime.js";

import { registerCatalogRoutes } from "./catalog-routes.js";

type Captured = {
  status?: number;
  body?: string;
  contentType?: string | string[];
};

function makeResponse(): { res: import("node:http").ServerResponse; captured: Captured } {
  const captured: Captured = {};
  const res = {
    set statusCode(value: number) {
      captured.status = value;
    },
    get statusCode() {
      return captured.status ?? 200;
    },
    setHeader(name: string, value: string | string[]) {
      if (name.toLowerCase() === "content-type") {
        captured.contentType = value;
      }
    },
    end(payload: string) {
      captured.body = payload;
    },
    headersSent: false
  } as unknown as import("node:http").ServerResponse;
  return { res, captured };
}

const NOT_CONFIGURED_ERROR = Object.assign(new Error("not configured"), {
  code: "ADO_CONTEXT_NOT_CONFIGURED"
});

function makeAdoRuntime(overrides: Partial<AdoRuntime>): AdoRuntime {
  return {
    resolveContext: async () => ({ organization: "c", project: "p" }),
    testManagement: async () => {
      throw new Error("not used");
    },
    testCatalog: async () => {
      throw new Error("not used");
    },
    workItemHydration: async () => {
      throw new Error("not used");
    },
    testCaseHydration: async () => {
      throw new Error("not used");
    },
    savedQuery: async () => {
      throw new Error("not used");
    },
    relations: async () => {
      throw new Error("not used");
    },
    ...overrides
  };
}

describe("registerCatalogRoutes", () => {
  it("returns plans on /phase2/test-plans", async () => {
    const catalog: TestCatalogPort = {
      listTestPlans: vi.fn(async () => [
        { id: 1, name: "Plan A", areaPath: null, iterationPath: null }
      ]),
      listSuitesForPlan: vi.fn(async () => [])
    };
    const route = registerCatalogRoutes(makeAdoRuntime({ testCatalog: async () => catalog }));
    const { res, captured } = makeResponse();

    const handled = await route(
      "GET",
      "/phase2/test-plans",
      new URL("http://localhost/phase2/test-plans"),
      {} as never,
      res
    );

    expect(handled).toBe(true);
    expect(captured.status).toBe(200);
    expect(JSON.parse(captured.body ?? "")).toEqual({
      plans: [{ id: 1, name: "Plan A", areaPath: null, iterationPath: null }]
    });
  });

  it("translates the ADO_CONTEXT_NOT_CONFIGURED error into HTTP 412", async () => {
    const route = registerCatalogRoutes(
      makeAdoRuntime({
        testCatalog: async () => {
          throw NOT_CONFIGURED_ERROR;
        }
      })
    );
    const { res, captured } = makeResponse();

    await route(
      "GET",
      "/phase2/test-plans",
      new URL("http://localhost/phase2/test-plans"),
      {} as never,
      res
    );

    expect(captured.status).toBe(412);
    expect(JSON.parse(captured.body ?? "")).toEqual({
      code: "ADO_CONTEXT_NOT_CONFIGURED",
      message: "Configure organization and project under /phase2/ado-context first."
    });
  });

  it("rejects non-numeric plan ids on the suites endpoint", async () => {
    const route = registerCatalogRoutes(makeAdoRuntime({}));
    const { res, captured } = makeResponse();

    const handled = await route(
      "GET",
      "/phase2/test-plans/abc/suites",
      new URL("http://localhost/phase2/test-plans/abc/suites"),
      {} as never,
      res
    );

    // Path doesn't match the numeric pattern so the catalog router declines —
    // the global 404 handler will then take over. Either way: the catalog
    // route must NOT call the adapter for non-numeric ids.
    expect(handled).toBe(false);
  });

  it("forwards listSuitesForPlan(planId) when the path matches", async () => {
    const calls: number[] = [];
    const catalog: TestCatalogPort = {
      listTestPlans: vi.fn(async () => []),
      listSuitesForPlan: vi.fn(async (planId) => {
        calls.push(planId);
        return [{ id: 7, name: "Suite", parentSuiteId: null, suiteType: null }];
      })
    };
    const route = registerCatalogRoutes(makeAdoRuntime({ testCatalog: async () => catalog }));
    const { res, captured } = makeResponse();

    await route(
      "GET",
      "/phase2/test-plans/42/suites",
      new URL("http://localhost/phase2/test-plans/42/suites"),
      {} as never,
      res
    );

    expect(calls).toEqual([42]);
    expect(JSON.parse(captured.body ?? "").suites).toHaveLength(1);
  });

  it("returns saved queries on /phase2/saved-queries", async () => {
    const port: SavedQueryPort = {
      listSavedQueries: vi.fn(async () => [
        { id: "q1", name: "My Query", path: "Shared/My Query", isFolder: false as const }
      ]),
      executeQuery: vi.fn(async () => ({ workItemIds: [], relations: [] }))
    };
    const route = registerCatalogRoutes(makeAdoRuntime({ savedQuery: async () => port }));
    const { res, captured } = makeResponse();

    await route(
      "GET",
      "/phase2/saved-queries",
      new URL("http://localhost/phase2/saved-queries"),
      {} as never,
      res
    );

    expect(captured.status).toBe(200);
    expect(JSON.parse(captured.body ?? "").queries).toHaveLength(1);
  });

  it("declines non-GET methods (router falls through to 404)", async () => {
    const route = registerCatalogRoutes(makeAdoRuntime({}));
    const { res } = makeResponse();
    const handled = await route(
      "POST",
      "/phase2/test-plans",
      new URL("http://localhost/phase2/test-plans"),
      {} as never,
      res
    );
    expect(handled).toBe(false);
  });
});
