import { describe, expect, it } from "vitest";

import { AzureTestManagementAdapter } from "./azure-test-management.adapter.js";
import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";

type FakeRoute = (url: string, callIndex: number) => AzureHttpResponse;

function makeStubClient(routes: FakeRoute): {
  client: AzureRestHttpClient;
  calls: string[];
} {
  const calls: string[] = [];
  let index = 0;
  return {
    calls,
    client: {
      get: async (url: string) => {
        calls.push(url);
        const response = routes(url, index);
        index += 1;
        return response;
      }
    }
  };
}

const ok = (json: unknown, headers: Record<string, string | undefined> = {}): AzureHttpResponse => ({
  status: 200,
  json,
  headers
});

describe("AzureTestManagementAdapter", () => {
  const ctx = { organization: "contoso", project: "delivery" };

  it("loads the suite subtree rooted at the requested suite id", async () => {
    const tree = {
      value: [
        {
          id: 1,
          name: "Root",
          children: [
            { id: 10, name: "API", parentSuite: { id: 1 }, children: [{ id: 20, name: "Auth", parentSuite: { id: 10 }, children: [] }] },
            { id: 11, name: "UI", parentSuite: { id: 1 }, children: [] }
          ]
        }
      ]
    };

    const { client, calls } = makeStubClient(() => ok(tree));
    const adapter = new AzureTestManagementAdapter(client, ctx);

    const result = await adapter.loadSuiteTree(99, 10);
    expect(result.id).toBe(10);
    expect(result.name).toBe("API");
    expect(result.path).toBe("API");
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe(20);
    expect(result.children[0].path).toBe("API > Auth");
    expect(result.children[0].parentSuiteId).toBe(10);
    expect(calls[0]).toContain("/_apis/test/Plans/99/suites?$asTreeView=true");
  });

  it("throws when the requested root suite is not in the tree", async () => {
    const { client } = makeStubClient(() => ok({ value: [{ id: 1, name: "Root", children: [] }] }));
    const adapter = new AzureTestManagementAdapter(client, ctx);
    await expect(adapter.loadSuiteTree(99, 999)).rejects.toThrow(/SUITE_TREE_ROOT_NOT_FOUND/);
  });

  it("extracts work item ids from the test case listing", async () => {
    const { client, calls } = makeStubClient(() =>
      ok({ value: [{ testCase: { id: 101 } }, { testCase: { id: 102 } }, { somethingElse: true }] })
    );
    const adapter = new AzureTestManagementAdapter(client, ctx);

    const ids = await adapter.listTestCasesInSuite(99, 10);
    expect(ids).toEqual([101, 102]);
    expect(calls[0]).toContain("/suites/10/testcases");
  });

  it("pages test points via continuation token", async () => {
    const pages = [
      ok(
        { value: [{ id: 1, testCase: { id: 101 }, configuration: { id: 1, name: "Default" } }] },
        { "x-ms-continuationtoken": "TOKEN-2" }
      ),
      ok(
        { value: [{ id: 2, testCase: { id: 102 }, configuration: { id: 1, name: "Default" } }] },
        {}
      )
    ];

    let pageIndex = 0;
    const { client, calls } = makeStubClient(() => {
      const page = pages[pageIndex];
      pageIndex += 1;
      return page;
    });
    const adapter = new AzureTestManagementAdapter(client, ctx);

    const points = await adapter.loadPointsForSuite(99, 10);
    expect(points.map((p) => p.pointId)).toEqual([1, 2]);
    expect(points[0].suiteId).toBe(10);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("continuationToken=TOKEN-2");
  });

  it("pages runs via skip/top until exhausted", async () => {
    let attempt = 0;
    const { client } = makeStubClient(() => {
      attempt += 1;
      if (attempt === 1) {
        return ok({
          value: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, plan: { id: 99 }, name: `Run ${i + 1}` }))
        });
      }
      if (attempt === 2) {
        return ok({
          value: [{ id: 1001, plan: { id: 99 }, name: "Run 1001" }]
        });
      }
      return ok({ value: [] });
    });

    const adapter = new AzureTestManagementAdapter(client, ctx);
    const runs = await adapter.listRunsForPlan(99);
    expect(runs).toHaveLength(1001);
    expect(attempt).toBe(2);
  });

  it("normalizes test results from the API to the domain shape", async () => {
    const { client } = makeStubClient(() =>
      ok({
        value: [
          {
            id: 7001,
            testRun: { id: 5000 },
            testCase: { id: 101 },
            testCaseReferenceId: 101,
            testSuite: { id: 10 },
            testPoint: { id: 1 },
            outcome: "Passed",
            completedDate: "2026-03-01T10:00:00Z"
          }
        ]
      })
    );

    const adapter = new AzureTestManagementAdapter(client, ctx);
    const results = await adapter.loadResultsForRun(5000);

    expect(results).toEqual([
      {
        resultId: 7001,
        runId: 5000,
        testCaseReferenceId: 101,
        suiteId: 10,
        pointId: 1,
        outcome: "Passed",
        completedDate: "2026-03-01T10:00:00Z"
      }
    ]);
  });
});
