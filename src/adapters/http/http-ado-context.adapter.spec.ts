// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpAdoContextAdapter } from "./http-ado-context.adapter.js";

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

describe("HttpAdoContextAdapter", () => {
  let adapter: HttpAdoContextAdapter;

  beforeEach(() => {
    setCsrfMeta("csrf-abc");
    adapter = new HttpAdoContextAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unwraps the ADO context payload from `{ context }`", async () => {
    installFetch(() => jsonResponse(200, { context: { organization: "c", project: "p" } }));

    const context = await adapter.getContext();

    expect(context).toEqual({ organization: "c", project: "p" });
  });

  it("posts the context with CSRF and JSON content-type", async () => {
    const fetchSpy = installFetch(() =>
      jsonResponse(200, { context: { organization: "c", project: "p" } })
    );

    await adapter.setContext({ organization: "c", project: "p" });

    const init = (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-ado-csrf-token"]).toBe("csrf-abc");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ organization: "c", project: "p" });
  });

  it("returns CLI defaults unwrapped from `{ defaults }`", async () => {
    installFetch(() =>
      jsonResponse(200, { defaults: { organization: "tensorfive", project: "AzureTestOps" } })
    );

    const defaults = await adapter.getCliDefaults();

    expect(defaults).toEqual({ organization: "tensorfive", project: "AzureTestOps" });
  });
});
