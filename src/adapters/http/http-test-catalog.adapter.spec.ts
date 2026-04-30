// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpTestCatalogAdapter } from "./http-test-catalog.adapter.js";

function installFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url.toString();
    return handler(target, init);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("HttpTestCatalogAdapter", () => {
  let adapter: HttpTestCatalogAdapter;

  beforeEach(() => {
    adapter = new HttpTestCatalogAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unwraps test plan responses", async () => {
    installFetch(() =>
      jsonResponse(200, { plans: [{ id: 1, name: "Plan", area: null, iteration: null }] })
    );

    const plans = await adapter.listTestPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe(1);
  });

  it("unwraps suite responses for the given plan", async () => {
    const fetchSpy = installFetch(() =>
      jsonResponse(200, { suites: [{ id: 1, name: "Root", parentSuiteId: null, suiteType: null }] })
    );

    const suites = await adapter.listSuitesForPlan(123);

    expect(suites).toEqual([{ id: 1, name: "Root", parentSuiteId: null, suiteType: null }]);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/phase2/test-plans/123/suites");
  });
});
