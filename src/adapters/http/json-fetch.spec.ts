// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonFetch } from "./json-fetch.js";
import { ApiError } from "../../application/dto/api-error.js";

type MockedFetch = ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): MockedFetch {
  const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url.toString();
    return handler(target, init);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy as unknown as MockedFetch;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function setCsrfMeta(token: string): void {
  document.head
    .querySelectorAll('meta[name="ado-csrf-token"]')
    .forEach((node) => node.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "ado-csrf-token");
  meta.setAttribute("content", token);
  document.head.appendChild(meta);
}

describe("jsonFetch", () => {
  beforeEach(() => {
    setCsrfMeta("csrf-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not attach CSRF on GET requests", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { ok: true }));

    await jsonFetch("/anything", { method: "GET" });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = init.headers as Record<string, string> | undefined;
    expect(headers?.["x-ado-csrf-token"]).toBeUndefined();
    expect(headers?.accept).toBe("application/json");
  });

  it("attaches the CSRF meta token + JSON content-type on POST", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, {}));

    await jsonFetch("/anything", { method: "POST", body: { a: 1 } });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-ado-csrf-token"]).toBe("csrf-abc");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ a: 1 });
  });

  it("throws ApiError carrying the server-supplied code on non-OK responses", async () => {
    installFetch(() =>
      jsonResponse(412, { code: "ADO_CONTEXT_NOT_CONFIGURED", message: "Configure first." })
    );

    await expect(jsonFetch("/x", { method: "GET" })).rejects.toMatchObject({
      name: "ApiError",
      status: 412,
      code: "ADO_CONTEXT_NOT_CONFIGURED"
    });
  });

  it("falls back to HTTP_<status> when the body has no code", async () => {
    installFetch(() => new Response("plain text", { status: 503 }));

    await expect(jsonFetch("/x", { method: "GET" })).rejects.toMatchObject({
      status: 503,
      code: "HTTP_503"
    });
    expect(ApiError).toBeDefined();
  });

  it("omits the body on DELETE without payload", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { status: "OK" }));

    await jsonFetch("/anything", { method: "DELETE" });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
