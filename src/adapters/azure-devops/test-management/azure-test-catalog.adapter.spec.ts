import { describe, expect, it } from "vitest";

import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";

import { AzureTestCatalogAdapter } from "./azure-test-catalog.adapter.js";

function makeStubClient(handler: (url: string) => AzureHttpResponse): {
  client: AzureRestHttpClient;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    client: {
      get: async (url) => {
        calls.push(url);
        return handler(url);
      }
    }
  };
}

const ok = (json: unknown, headers: Record<string, string | undefined> = {}): AzureHttpResponse => ({
  status: 200,
  json,
  headers
});

const ctx = { organization: "contoso", project: "delivery" };

describe("AzureTestCatalogAdapter", () => {
  it("pages through plans via continuation token", async () => {
    const pages = new Map<string, AzureHttpResponse>();
    const baseUrl = "https://dev.azure.com/contoso/delivery/_apis/test/plans?$top=200&api-version=5.0";
    pages.set(baseUrl, ok({ value: [{ id: 1, name: "Plan A", areaPath: "Org/A" }] }, { "x-ms-continuationtoken": "next" }));
    pages.set(`${baseUrl}&continuationToken=next`, ok({ value: [{ id: 2, name: "Plan B" }] }));

    const { client, calls } = makeStubClient((url) => {
      const page = pages.get(url);
      if (!page) {
        throw new Error(`unexpected url: ${url}`);
      }
      return page;
    });
    const adapter = new AzureTestCatalogAdapter(client, ctx);

    const result = await adapter.listTestPlans();

    expect(result).toEqual([
      { id: 1, name: "Plan A", areaPath: "Org/A", iterationPath: null },
      { id: 2, name: "Plan B", areaPath: null, iterationPath: null }
    ]);
    expect(calls).toEqual([baseUrl, `${baseUrl}&continuationToken=next`]);
  });

  it("flattens suites for a plan and parses parentSuite.id", async () => {
    const { client, calls } = makeStubClient(() =>
      ok({
        value: [
          { id: 10, name: "Root", parentSuite: null, suiteType: "StaticTestSuite" },
          { id: 11, name: "API", parentSuite: { id: 10 } },
          { id: 12, name: "UI", parentSuite: { id: 10 }, suiteType: "DynamicTestSuite" }
        ]
      })
    );
    const adapter = new AzureTestCatalogAdapter(client, ctx);

    const suites = await adapter.listSuitesForPlan(123);

    expect(suites).toEqual([
      { id: 10, name: "Root", parentSuiteId: null, suiteType: "StaticTestSuite" },
      { id: 11, name: "API", parentSuiteId: 10, suiteType: null },
      { id: 12, name: "UI", parentSuiteId: 10, suiteType: "DynamicTestSuite" }
    ]);
    expect(calls).toEqual([
      "https://dev.azure.com/contoso/delivery/_apis/test/Plans/123/suites?api-version=5.0"
    ]);
  });

  it("throws on non-200 plan responses", async () => {
    const { client } = makeStubClient(() => ({ status: 401, json: { message: "no" }, headers: {} }));
    const adapter = new AzureTestCatalogAdapter(client, ctx);

    await expect(adapter.listTestPlans()).rejects.toThrow(/PLANS_HTTP_401/);
  });
});
