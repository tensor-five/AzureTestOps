// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpSavedQueryAdapter } from "./http-saved-query.adapter.js";
import { ApiError } from "../../application/dto/api-error.js";

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

describe("HttpSavedQueryAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unwraps query responses from `{ queries }`", async () => {
    installFetch(() =>
      jsonResponse(200, {
        queries: [
          { id: "q1", name: "Open Bugs", path: "Shared Queries/Bugs/Open Bugs", isFolder: false }
        ]
      })
    );

    const queries = await new HttpSavedQueryAdapter().list();

    expect(queries).toHaveLength(1);
    expect(queries[0]?.id).toBe("q1");
  });

  it("propagates ApiError on non-OK responses", async () => {
    installFetch(() => new Response("plain text", { status: 503 }));

    await expect(new HttpSavedQueryAdapter().list()).rejects.toBeInstanceOf(ApiError);
  });
});
