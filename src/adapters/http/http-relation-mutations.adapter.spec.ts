// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpRelationMutationsAdapter } from "./http-relation-mutations.adapter.js";

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

function setCsrfMeta(token: string): void {
  document.head
    .querySelectorAll('meta[name="ado-csrf-token"]')
    .forEach((node) => node.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "ado-csrf-token");
  meta.setAttribute("content", token);
  document.head.appendChild(meta);
}

describe("HttpRelationMutationsAdapter", () => {
  let adapter: HttpRelationMutationsAdapter;

  beforeEach(() => {
    setCsrfMeta("csrf-abc");
    adapter = new HttpRelationMutationsAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to /phase2/relations with the link body and CSRF header", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { status: "OK" }));

    await adapter.add({ sourceId: 11, targetId: 22 });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/phase2/relations");
    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sourceId: 11, targetId: 22 });
    expect((init.headers as Record<string, string>)["x-ado-csrf-token"]).toBe("csrf-abc");
  });

  it("sends a DELETE with body to /phase2/relations on remove", async () => {
    const fetchSpy = installFetch(() => jsonResponse(200, { status: "OK" }));

    await adapter.remove({ sourceId: 33, targetId: 44 });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ sourceId: 33, targetId: 44 });
  });
});
