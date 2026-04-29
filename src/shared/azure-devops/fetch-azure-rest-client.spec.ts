import { describe, expect, it } from "vitest";

import {
  FetchAzureRestClient,
  type FetchLike
} from "./fetch-azure-rest-client.js";

function makeStubFetch(handler: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  status: number;
  body: string;
  headers?: Record<string, string>;
}): { fetchImpl: FetchLike; calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> } {
  const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const result = handler(url, init);
    const headerEntries = Object.entries(result.headers ?? {});
    return {
      status: result.status,
      text: async () => result.body,
      headers: {
        get: (name: string) => {
          const found = headerEntries.find(([key]) => key.toLowerCase() === name.toLowerCase());
          return found ? found[1] : null;
        },
        forEach: (cb) => {
          for (const [name, value] of headerEntries) {
            cb(value, name);
          }
        }
      }
    };
  };
  return { fetchImpl, calls };
}

describe("FetchAzureRestClient", () => {
  it("attaches a bearer token from the provider on GET", async () => {
    const { fetchImpl, calls } = makeStubFetch(() => ({
      status: 200,
      body: JSON.stringify({ value: [1, 2, 3] }),
      headers: { "x-ms-continuationtoken": "abc" }
    }));

    const client = new FetchAzureRestClient({
      bearer: async () => ({ accessToken: "the-bearer" }),
      fetchImpl
    });

    const response = await client.get("https://dev.azure.com/x/y");

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ value: [1, 2, 3] });
    expect(response.headers?.["x-ms-continuationtoken"]).toBe("abc");
    expect(calls[0].init?.headers?.authorization).toBe("Bearer the-bearer");
  });

  it("prefers a PAT auth header when both are configured", async () => {
    const { fetchImpl, calls } = makeStubFetch(() => ({ status: 200, body: "{}" }));
    const client = new FetchAzureRestClient({
      pat: () => "secret-pat",
      bearer: async () => ({ accessToken: "ignored" }),
      fetchImpl
    });

    await client.get("https://dev.azure.com/x/y");

    const auth = calls[0].init?.headers?.authorization ?? "";
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8")).toBe(":secret-pat");
  });

  it("PATCH sends application/json-patch+json by default", async () => {
    const { fetchImpl, calls } = makeStubFetch(() => ({ status: 200, body: "{}" }));
    const client = new FetchAzureRestClient({
      bearer: async () => ({ accessToken: "tok" }),
      fetchImpl
    });

    await client.patch("https://dev.azure.com/x/y", [{ op: "test", path: "/rev", value: 1 }]);

    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].init?.headers?.["content-type"]).toBe("application/json-patch+json");
    expect(JSON.parse(calls[0].init?.body ?? "[]")).toEqual([
      { op: "test", path: "/rev", value: 1 }
    ]);
  });

  it("returns text fallback when body is not JSON", async () => {
    const { fetchImpl } = makeStubFetch(() => ({ status: 500, body: "not json" }));
    const client = new FetchAzureRestClient({ fetchImpl });

    const response = await client.get("https://dev.azure.com/x/y");
    expect(response.status).toBe(500);
    expect(response.json).toBe("not json");
  });
});
