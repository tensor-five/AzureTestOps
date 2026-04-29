// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCachedUserPreferences,
  hydrateUserPreferences,
  persistUserPreferencesPatch,
  resetUserPreferencesCacheForTests
} from "./user-preferences.client.js";

const ENDPOINT = "/phase2/user-preferences";

type FetchInit = RequestInit & { method?: string };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("user-preferences.client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetUserPreferencesCacheForTests();
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

  it("hydrate caches the sanitised payload and serves it via getCachedUserPreferences", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        preferences: { themeMode: "dark", activeSetId: "set-9" }
      })
    );

    const cached = await hydrateUserPreferences();
    expect(cached.themeMode).toBe("dark");
    expect(cached.activeSetId).toBe("set-9");
    expect(getCachedUserPreferences().themeMode).toBe("dark");
  });

  it("hydrate dedupes concurrent calls into a single fetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ preferences: {} }));

    const [a, b] = await Promise.all([hydrateUserPreferences(), hydrateUserPreferences()]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persistUserPreferencesPatch updates the cache synchronously and POSTs the sanitised patch", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    persistUserPreferencesPatch({ themeMode: "light" });

    expect(getCachedUserPreferences().themeMode).toBe("light");
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ preferences: { themeMode: "light" } })
      })
    );
  });

  it("persistUserPreferencesPatch drops invalid fields via sanitiseUserPreferences before POSTing", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    persistUserPreferencesPatch({
      themeMode: "neon" as unknown as "system",
      activeSetId: "  "
    });

    const lastCall = fetchMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const init = lastCall?.[1] as FetchInit;
    expect(init.body).toBe(JSON.stringify({ preferences: {} }));
    expect(getCachedUserPreferences().themeMode).toBeUndefined();
  });

  it("persistUserPreferencesPatch attaches the CSRF header when the meta tag is present", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const meta = document.createElement("meta");
    meta.setAttribute("name", "ado-csrf-token");
    meta.setAttribute("content", "csrf-token-abc");
    document.head.appendChild(meta);

    persistUserPreferencesPatch({ themeMode: "dark" });

    const init = fetchMock.mock.calls.at(-1)?.[1] as FetchInit | undefined;
    expect(init?.headers).toMatchObject({ "x-ado-csrf-token": "csrf-token-abc" });
  });

  it("persistUserPreferencesPatch keeps the local cache even if the POST fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    persistUserPreferencesPatch({ themeMode: "system" });

    // Allow the rejected promise to settle without surfacing as an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();

    expect(getCachedUserPreferences().themeMode).toBe("system");
  });
});
