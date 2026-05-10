import { describe, expect, it } from "vitest";

import { AzureSavedQueryAdapter } from "./azure-saved-query.adapter.js";
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

describe("AzureSavedQueryAdapter", () => {
  const ctx = { organization: "contoso", project: "delivery" };

  describe("listSavedQueries", () => {
    it("requests the Shared Queries root with depth=2 and expand=all", async () => {
      const { client, calls } = makeStubClient(() =>
        ok({
          isFolder: true,
          name: "Shared Queries",
          children: []
        })
      );
      const adapter = new AzureSavedQueryAdapter(client, ctx);

      await adapter.listSavedQueries();

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("/_apis/wit/queries/Shared%20Queries");
      expect(calls[0]).toContain("$depth=2");
      expect(calls[0]).toContain("$expand=all");
      expect(calls[0]).toContain("api-version=7.1");
    });

    it("flattens nested folders into leaf queries only", async () => {
      const { client } = makeStubClient(() =>
        ok({
          isFolder: true,
          name: "Shared Queries",
          path: "Shared Queries",
          children: [
            {
              isFolder: false,
              id: "q-1",
              name: "Open Bugs",
              path: "Shared Queries/Open Bugs"
            },
            {
              isFolder: true,
              name: "Triage",
              path: "Shared Queries/Triage",
              children: [
                {
                  isFolder: false,
                  id: "q-2",
                  name: "P1 Bugs",
                  path: "Shared Queries/Triage/P1 Bugs"
                },
                {
                  isFolder: false,
                  id: "q-3",
                  name: "P2 Bugs",
                  path: "Shared Queries/Triage/P2 Bugs"
                }
              ]
            }
          ]
        })
      );
      const adapter = new AzureSavedQueryAdapter(client, ctx);

      const queries = await adapter.listSavedQueries();
      expect(queries).toEqual([
        { id: "q-1", name: "Open Bugs", path: "Shared Queries/Open Bugs", isFolder: false },
        { id: "q-2", name: "P1 Bugs", path: "Shared Queries/Triage/P1 Bugs", isFolder: false },
        { id: "q-3", name: "P2 Bugs", path: "Shared Queries/Triage/P2 Bugs", isFolder: false }
      ]);
    });

    it("returns an empty list when the folder is empty", async () => {
      const { client } = makeStubClient(() =>
        ok({ isFolder: true, name: "Shared Queries", children: [] })
      );
      const adapter = new AzureSavedQueryAdapter(client, ctx);
      expect(await adapter.listSavedQueries()).toEqual([]);
    });

    it("throws on non-200", async () => {
      const { client } = makeStubClient(() => ({ status: 404, json: {} }));
      const adapter = new AzureSavedQueryAdapter(client, ctx);
      await expect(adapter.listSavedQueries()).rejects.toThrow("SAVED_QUERY_LIST_HTTP_404");
    });
  });

  describe("executeQuery", () => {
    it("issues GET /_apis/wit/wiql/{id} with the encoded id and api-version", async () => {
      const { client, calls } = makeStubClient(() => ok({ workItems: [], workItemRelations: [] }));
      const adapter = new AzureSavedQueryAdapter(client, ctx);

      await adapter.executeQuery("abc def/123");

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("/_apis/wit/wiql/abc%20def%2F123");
      expect(calls[0]).toContain("api-version=7.1");
    });

    it("returns workItemIds and workItemRelations", async () => {
      const { client } = makeStubClient(() =>
        ok({
          workItems: [{ id: 1 }, { id: 2 }, { id: 3 }],
          workItemRelations: [{ rel: "System.LinkTypes.Hierarchy-Forward" }]
        })
      );
      const adapter = new AzureSavedQueryAdapter(client, ctx);

      const result = await adapter.executeQuery("query-id");
      expect(result.workItemIds).toEqual([1, 2, 3]);
      expect(result.relations).toHaveLength(1);
    });

    it("returns empty arrays when payload is empty", async () => {
      const { client } = makeStubClient(() => ok({}));
      const adapter = new AzureSavedQueryAdapter(client, ctx);

      const result = await adapter.executeQuery("query-id");
      expect(result.workItemIds).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it("throws on non-200", async () => {
      const { client } = makeStubClient(() => ({ status: 401, json: {} }));
      const adapter = new AzureSavedQueryAdapter(client, ctx);
      await expect(adapter.executeQuery("query-id")).rejects.toThrow("SAVED_QUERY_EXECUTE_HTTP_401");
    });

    it("rejects an empty / whitespace id without making an HTTP call", async () => {
      const { client, calls } = makeStubClient(() => ok({}));
      const adapter = new AzureSavedQueryAdapter(client, ctx);
      await expect(adapter.executeQuery("   ")).rejects.toThrow("SAVED_QUERY_EXECUTE_INVALID_ID");
      expect(calls).toHaveLength(0);
    });
  });
});
