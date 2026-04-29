import { describe, expect, it } from "vitest";

import { AzureRelationAdapter } from "./azure-relation.adapter.js";
import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";

type StubCall =
  | { method: "GET"; url: string }
  | { method: "PATCH"; url: string; body: unknown; headers?: Record<string, string> };

type GetHandler = (url: string) => AzureHttpResponse;
type PatchHandler = (
  url: string,
  body: unknown,
  headers?: Record<string, string>
) => AzureHttpResponse;

function makeStubClient(handlers: { get: GetHandler; patch: PatchHandler }): {
  client: AzureRestHttpClient;
  calls: StubCall[];
} {
  const calls: StubCall[] = [];
  return {
    calls,
    client: {
      get: async (url) => {
        calls.push({ method: "GET", url });
        return handlers.get(url);
      },
      patch: async (url, body, headers) => {
        calls.push({ method: "PATCH", url, body, headers });
        return handlers.patch(url, body, headers);
      }
    }
  };
}

const ok = (json: unknown): AzureHttpResponse => ({ status: 200, json });
const status = (code: number, json: unknown = {}): AzureHttpResponse => ({ status: code, json });

const ctx = { organization: "contoso", project: "delivery" };

const buildSourceItem = (rev: number, relations: Array<{ rel: string; url: string }> = []) => ({
  id: 101,
  rev,
  relations
});

describe("AzureRelationAdapter", () => {
  describe("constructor", () => {
    it("throws when the http client cannot PATCH", () => {
      expect(
        () => new AzureRelationAdapter({ get: async () => ok({}) }, ctx)
      ).toThrow(/httpClient.patch is required/);
    });
  });

  describe("addRelation", () => {
    it("reads rev, then PATCHes with op:test /rev and op:add /relations/-", async () => {
      const { client, calls } = makeStubClient({
        get: () => ok(buildSourceItem(7)),
        patch: () => ok({ id: 101, rev: 8 })
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await adapter.addRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 });

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: "GET" });
      expect((calls[0] as { url: string }).url).toContain("$expand=relations");

      expect(calls[1]).toMatchObject({ method: "PATCH" });
      const patchCall = calls[1] as { url: string; body: unknown; headers?: Record<string, string> };
      expect(patchCall.url).toContain("/_apis/wit/workitems/101");
      expect(patchCall.headers?.["content-type"]).toBe("application/json-patch+json");
      expect(patchCall.body).toEqual([
        { op: "test", path: "/rev", value: 7 },
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: "System.LinkTypes.Related",
            url: "https://dev.azure.com/contoso/_apis/wit/workItems/202",
            attributes: { comment: "" }
          }
        }
      ]);
    });

    it("re-reads and retries once on 409 RevisionMismatch", async () => {
      const revs = [7, 9];
      const patchResponses: AzureHttpResponse[] = [
        status(409, { typeKey: "WorkItemUpdateRevisionMismatch" }),
        ok({ id: 101, rev: 10 })
      ];
      const { client, calls } = makeStubClient({
        get: () => ok(buildSourceItem(revs.shift() ?? 0)),
        patch: () => patchResponses.shift() ?? status(500)
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await adapter.addRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 });

      const patchCalls = calls.filter((call) => call.method === "PATCH") as Array<{
        body: { op: string; path: string; value: unknown }[];
      }>;
      expect(patchCalls).toHaveLength(2);
      expect(patchCalls[0].body[0]).toMatchObject({ op: "test", path: "/rev", value: 7 });
      expect(patchCalls[1].body[0]).toMatchObject({ op: "test", path: "/rev", value: 9 });
    });

    it("treats 400 RelationAlreadyExists as idempotent success", async () => {
      const { client, calls } = makeStubClient({
        get: () => ok(buildSourceItem(7)),
        patch: () => status(400, { typeKey: "RelationAlreadyExistsException", message: "..." })
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.addRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).resolves.toBeUndefined();
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
    });

    it("surfaces non-handled HTTP errors", async () => {
      const { client } = makeStubClient({
        get: () => ok(buildSourceItem(7)),
        patch: () => status(403, { message: "forbidden" })
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.addRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).rejects.toThrow("RELATION_ADD_HTTP_403");
    });

    it("throws when the source GET fails", async () => {
      const { client } = makeStubClient({
        get: () => status(404),
        patch: () => ok({})
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.addRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).rejects.toThrow("RELATION_READ_HTTP_404");
    });
  });

  describe("removeRelation", () => {
    const existingRelation = {
      rel: "System.LinkTypes.Related",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/202"
    };

    it("looks up the index of the matching relation and PATCHes op:remove", async () => {
      const { client, calls } = makeStubClient({
        get: () =>
          ok(
            buildSourceItem(7, [
              { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://dev.azure.com/contoso/_apis/wit/workItems/501" },
              existingRelation
            ])
          ),
        patch: () => ok({})
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await adapter.removeRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 });

      const patchCall = calls.find((call) => call.method === "PATCH") as
        | { body: unknown }
        | undefined;
      expect(patchCall?.body).toEqual([
        { op: "test", path: "/rev", value: 7 },
        { op: "remove", path: "/relations/1" }
      ]);
    });

    it("returns silently when the relation is already absent (idempotent)", async () => {
      const { client, calls } = makeStubClient({
        get: () => ok(buildSourceItem(7, [])),
        patch: () => ok({})
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.removeRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).resolves.toBeUndefined();
      expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(0);
    });

    it("re-reads on 409 and retries once with the new index", async () => {
      const reads = [
        ok(buildSourceItem(7, [existingRelation])),
        ok(buildSourceItem(8, [{ rel: "System.LinkTypes.Hierarchy-Forward", url: "x/_apis/wit/workItems/9" }, existingRelation]))
      ];
      const patches: AzureHttpResponse[] = [status(409, {}), ok({})];
      const { client, calls } = makeStubClient({
        get: () => reads.shift() ?? status(500),
        patch: () => patches.shift() ?? status(500)
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await adapter.removeRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 });

      const patchCalls = calls.filter((call) => call.method === "PATCH") as Array<{
        body: { op: string; path: string; value?: unknown }[];
      }>;
      expect(patchCalls).toHaveLength(2);
      expect(patchCalls[0].body).toEqual([
        { op: "test", path: "/rev", value: 7 },
        { op: "remove", path: "/relations/0" }
      ]);
      expect(patchCalls[1].body).toEqual([
        { op: "test", path: "/rev", value: 8 },
        { op: "remove", path: "/relations/1" }
      ]);
    });

    it("treats 404 on remove as idempotent success", async () => {
      const { client } = makeStubClient({
        get: () => ok(buildSourceItem(7, [existingRelation])),
        patch: () => status(404)
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.removeRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).resolves.toBeUndefined();
    });

    it("surfaces non-handled HTTP errors", async () => {
      const { client } = makeStubClient({
        get: () => ok(buildSourceItem(7, [existingRelation])),
        patch: () => status(500)
      });
      const adapter = new AzureRelationAdapter(client, ctx);

      await expect(
        adapter.removeRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 })
      ).rejects.toThrow("RELATION_REMOVE_HTTP_500");
    });
  });
});
