// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createSetRequest,
  deleteSetRequest,
  getAdoContext,
  listSavedQueries,
  listSets,
  listSuitesForPlan,
  listTestPlans,
  setActiveSetRequest,
  setAdoContext,
  updateSetRequest
} from "./api-client.js";

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

describe("api-client", () => {
  beforeEach(() => {
    setCsrfMeta("csrf-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not attach CSRF on GET requests", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { context: { organization: "c", project: "p" } }));

    const context = await getAdoContext();

    expect(context).toEqual({ organization: "c", project: "p" });
    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = init.headers as Record<string, string> | undefined;
    expect(headers?.["x-ado-csrf-token"]).toBeUndefined();
    expect(headers?.accept).toBe("application/json");
  });

  it("attaches the CSRF meta token + JSON content-type on POST", async () => {
    const fetchSpy = installFetch(() =>
      jsonResponse(200, { context: { organization: "c", project: "p" } })
    );

    await setAdoContext({ organization: "c", project: "p" });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-ado-csrf-token"]).toBe("csrf-abc");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ organization: "c", project: "p" });
  });

  it("throws ApiError carrying the server-supplied code on non-OK responses", async () => {
    installFetch(() =>
      jsonResponse(412, { code: "ADO_CONTEXT_NOT_CONFIGURED", message: "Configure first." })
    );

    await expect(listTestPlans()).rejects.toMatchObject({
      name: "ApiError",
      status: 412,
      code: "ADO_CONTEXT_NOT_CONFIGURED"
    });
  });

  it("falls back to HTTP_<status> when the body has no code", async () => {
    installFetch(() => new Response("plain text", { status: 503 }));

    await expect(listSavedQueries()).rejects.toMatchObject({
      status: 503,
      code: "HTTP_503"
    });
    expect(ApiError).toBeDefined();
  });

  it("URL-encodes set ids when targeting /phase2/sets/:id", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { set: { id: "foo bar" } }));

    await updateSetRequest("foo bar", { name: "x" });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/phase2/sets/foo%20bar");
  });

  it("plumbs DELETE /phase2/sets/:id without a body", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { status: "OK" }));

    await deleteSetRequest("abc");

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("forwards setId payloads on /phase2/active-set", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { activeSetId: null }));

    await setActiveSetRequest(null);

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ setId: null });
  });

  it("normalizes the listSets response shape", async () => {
    installFetch(() =>
      jsonResponse(200, {
        sets: [{ id: "a", name: "A", planId: "1", rootSuiteId: "2", queryId: "Q" }],
        activeSetId: "a"
      })
    );

    const result = await listSets();
    expect(result.activeSetId).toBe("a");
    expect(result.sets).toHaveLength(1);
  });

  it("returns the created set unwrapped from { set }", async () => {
    installFetch(() =>
      jsonResponse(201, { set: { id: "new", name: "New", planId: "1", rootSuiteId: "1", queryId: "Q" } })
    );

    const created = await createSetRequest({
      name: "New",
      planId: "1",
      rootSuiteId: "1",
      queryId: "Q"
    });

    expect(created.id).toBe("new");
  });

  it("returns suites unwrapped from listSuitesForPlan", async () => {
    installFetch(() =>
      jsonResponse(200, { suites: [{ id: 1, name: "Root", parentSuiteId: null, suiteType: null }] })
    );

    const result = await listSuitesForPlan(123);
    expect(result).toEqual([{ id: 1, name: "Root", parentSuiteId: null, suiteType: null }]);
  });
});
