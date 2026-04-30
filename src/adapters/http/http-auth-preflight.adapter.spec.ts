// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpAuthPreflightAdapter } from "./http-auth-preflight.adapter.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("HttpAuthPreflightAdapter", () => {
  let adapter: HttpAuthPreflightAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    adapter = new HttpAuthPreflightAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the server-reported status when the call succeeds", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: { status: "READY" } }));

    const status = await adapter.check();

    expect(status).toBe("READY");
    expect(fetchMock).toHaveBeenCalledWith(
      "/phase2/auth-preflight",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );
  });

  it("falls back to UNKNOWN_ERROR when the response is not OK", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    expect(await adapter.check()).toBe("UNKNOWN_ERROR");
  });

  it("falls back to UNKNOWN_ERROR when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(await adapter.check()).toBe("UNKNOWN_ERROR");
  });
});
