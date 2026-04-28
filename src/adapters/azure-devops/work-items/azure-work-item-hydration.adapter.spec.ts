import { describe, expect, it } from "vitest";

import { AzureWorkItemHydrationAdapter } from "./azure-work-item-hydration.adapter.js";
import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";

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

const ok = (json: unknown): AzureHttpResponse => ({ status: 200, json });

const buildWorkItem = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  fields: {
    "System.Title": `Work Item ${id}`,
    "System.State": "Active",
    "System.WorkItemType": "Test Case",
    ...overrides
  }
});

describe("AzureWorkItemHydrationAdapter", () => {
  const ctx = { organization: "contoso", project: "delivery" };

  it("returns an empty map for an empty input list", async () => {
    const { client, calls } = makeStubClient(() => ok({ value: [] }));
    const adapter = new AzureWorkItemHydrationAdapter(client, ctx);

    const result = await adapter.hydrateWorkItems([]);
    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("chunks ids at the configured size and merges results", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => 100 + i);

    const { client, calls } = makeStubClient((url) => {
      const idMatch = url.match(/ids=([^&]+)/);
      const requestedIds = idMatch ? idMatch[1].split(",").map((value) => Number.parseInt(value, 10)) : [];
      return ok({ value: requestedIds.map((id) => buildWorkItem(id)) });
    });

    const adapter = new AzureWorkItemHydrationAdapter(client, ctx, { chunkSize: 2 });
    const result = await adapter.hydrateWorkItems(ids);

    expect(result.size).toBe(5);
    expect(result.get(100)?.title).toBe("Work Item 100");
    expect(calls).toHaveLength(3);
  });

  it("dedupes incoming ids", async () => {
    const { client, calls } = makeStubClient(() => ok({ value: [buildWorkItem(101)] }));
    const adapter = new AzureWorkItemHydrationAdapter(client, ctx);

    await adapter.hydrateWorkItems([101, 101, 101]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("ids=101");
    expect(calls[0]).not.toContain("ids=101,101");
  });

  it("parses tags, assigned-to displayName and priority from fields", async () => {
    const { client } = makeStubClient(() =>
      ok({
        value: [
          buildWorkItem(101, {
            "System.Tags": "smoke; auth; flaky",
            "System.AssignedTo": { displayName: "Alice" },
            "System.AreaPath": "Project\\Area1",
            "Microsoft.VSTS.Common.Priority": 2
          })
        ]
      })
    );
    const adapter = new AzureWorkItemHydrationAdapter(client, ctx);

    const result = await adapter.hydrateWorkItems([101]);
    const workItem = result.get(101);
    expect(workItem?.tags).toEqual(["smoke", "auth", "flaky"]);
    expect(workItem?.assignedTo).toBe("Alice");
    expect(workItem?.areaPath).toBe("Project\\Area1");
    expect(workItem?.priority).toBe(2);
  });

  it("extracts related work item ids from System.LinkTypes.Related relations", async () => {
    const { client } = makeStubClient(() =>
      ok({
        value: [
          {
            id: 101,
            fields: { "System.Title": "Login", "System.State": "Active", "System.WorkItemType": "Test Case" },
            relations: [
              {
                rel: "System.LinkTypes.Related",
                url: "https://dev.azure.com/contoso/delivery/_apis/wit/workItems/9001"
              },
              {
                rel: "System.LinkTypes.Related",
                url: "https://dev.azure.com/contoso/delivery/_apis/wit/workItems/9002"
              },
              {
                rel: "System.LinkTypes.Hierarchy-Forward",
                url: "https://dev.azure.com/contoso/delivery/_apis/wit/workItems/8001"
              }
            ]
          }
        ]
      })
    );
    const adapter = new AzureWorkItemHydrationAdapter(client, ctx);

    const result = await adapter.hydrateWorkItems([101]);
    expect(result.get(101)?.relatedIds).toEqual([9001, 9002]);
  });
});
