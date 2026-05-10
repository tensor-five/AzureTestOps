// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpUserPreferencesAdapter } from "./http-user-preferences.adapter.js";

const ENDPOINT = "/phase2/user-preferences";

type FetchInit = RequestInit & { method?: string };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("HttpUserPreferencesAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let adapter: HttpUserPreferencesAdapter;

  beforeEach(() => {
    adapter = new HttpUserPreferencesAdapter();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    document.head
      .querySelectorAll('meta[name="ado-csrf-token"]')
      .forEach((node) => node.remove());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hydrate caches the sanitised payload and serves it via getCached", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ preferences: { themeMode: "dark", activeSetId: "set-9" } })
    );

    const cached = await adapter.hydrate();
    expect(cached.themeMode).toBe("dark");
    expect(cached.activeSetId).toBe("set-9");
    expect(adapter.getCached().themeMode).toBe("dark");
  });

  it("hydrate dedupes concurrent calls into a single fetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ preferences: {} }));

    const [a, b] = await Promise.all([adapter.hydrate(), adapter.hydrate()]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persistPatch updates the cache synchronously and POSTs the sanitised patch", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    adapter.persistPatch({ themeMode: "light" });

    expect(adapter.getCached().themeMode).toBe("light");
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ preferences: { themeMode: "light" } })
      })
    );
  });

  it("persistPatch drops invalid fields via sanitiseUserPreferences before POSTing", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    adapter.persistPatch({
      themeMode: "neon" as unknown as "system",
      activeSetId: "  "
    });

    const init = fetchMock.mock.calls.at(-1)?.[1] as FetchInit | undefined;
    expect(init?.body).toBe(JSON.stringify({ preferences: {} }));
    expect(adapter.getCached().themeMode).toBeUndefined();
  });

  it("persistPatch attaches the CSRF header when the meta tag is present", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const meta = document.createElement("meta");
    meta.setAttribute("name", "ado-csrf-token");
    meta.setAttribute("content", "csrf-token-abc");
    document.head.appendChild(meta);

    adapter.persistPatch({ themeMode: "dark" });

    const init = fetchMock.mock.calls.at(-1)?.[1] as FetchInit | undefined;
    expect(init?.headers).toMatchObject({ "x-ado-csrf-token": "csrf-token-abc" });
  });

  it("persistPatch keeps the local cache even if the POST fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    adapter.persistPatch({ themeMode: "system" });

    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.getCached().themeMode).toBe("system");
  });

  it("persistPatch merges setLayouts per setId without clobbering siblings", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    adapter.persistPatch({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    adapter.persistPatch({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });

    expect(adapter.getCached().setLayouts).toEqual({
      "set-1": { workItemOrder: [1, 2] },
      "set-2": { workItemOrder: [10, 20] }
    });
  });

  it("persistPatch deletes a single setLayouts entry on an empty value while keeping siblings", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    adapter.persistPatch({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    adapter.persistPatch({ setLayouts: { "set-1": {} } });

    expect(adapter.getCached().setLayouts).toEqual({
      "set-2": { workItemOrder: [10, 20] }
    });
  });
});
