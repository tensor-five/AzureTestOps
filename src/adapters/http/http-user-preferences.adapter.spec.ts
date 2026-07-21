// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UserPreferencesClientError
} from "../../application/ports/client/user-preferences-client.port.js";
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
    vi.useRealTimers();
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

  it("persistPatch updates the cache synchronously and POSTs the sanitised patch", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const persisted = adapter.persistPatch({ themeMode: "light" });

    expect(adapter.getCached().themeMode).toBe("light");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ preferences: { themeMode: "light" } })
      })
    );
    await expect(persisted).resolves.toBeUndefined();
  });

  it("persistPatch drops invalid fields via sanitiseUserPreferences before POSTing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const persisted = adapter.persistPatch({
      themeMode: "neon" as unknown as "system",
      activeSetId: "  "
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls.at(-1)?.[1] as FetchInit | undefined;
    expect(init?.body).toBe(JSON.stringify({ preferences: {} }));
    expect(adapter.getCached().themeMode).toBeUndefined();
    await expect(persisted).resolves.toBeUndefined();
  });

  it("persistPatch attaches the CSRF header when the meta tag is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const meta = document.createElement("meta");
    meta.setAttribute("name", "ado-csrf-token");
    meta.setAttribute("content", "csrf-token-abc");
    document.head.appendChild(meta);

    const persisted = adapter.persistPatch({ themeMode: "dark" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls.at(-1)?.[1] as FetchInit | undefined;
    expect(init?.headers).toMatchObject({ "x-ado-csrf-token": "csrf-token-abc" });
    await expect(persisted).resolves.toBeUndefined();
  });

  it("persistPatch keeps the local cache even if the POST fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const persisted = adapter.persistPatch({ themeMode: "system" });

    expect(adapter.getCached().themeMode).toBe("system");
    await expect(persisted).rejects.toMatchObject({
      name: "UserPreferencesClientError",
      operation: "save",
      message:
        "Settings could not be saved permanently. Your changes remain available in this browser."
    });
  });

  it("serializes rapid writes in call order while keeping the latest cache synchronously", async () => {
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    fetchMock
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse({}));

    const firstWrite = adapter.persistPatch({ themeMode: "dark" });
    const secondWrite = adapter.persistPatch({ themeMode: "light" });

    expect(adapter.getCached().themeMode).toBe("light");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: { themeMode: "dark" } })
    );

    resolveFirst(jsonResponse({}));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: { themeMode: "light" } })
    );
    await expect(firstWrite).resolves.toBeUndefined();
    await expect(secondWrite).resolves.toBeUndefined();
  });

  it("continues queued writes after an earlier POST fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({}));

    const firstWrite = adapter.persistPatch({ themeMode: "dark" });
    const secondWrite = adapter.persistPatch({ activeSetId: "set-2" });

    await expect(firstWrite).rejects.toBeInstanceOf(UserPreferencesClientError);
    await expect(secondWrite).resolves.toBeUndefined();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: { themeMode: "dark", activeSetId: "set-2" } })
    );
    expect(adapter.getCached()).toMatchObject({ themeMode: "dark", activeSetId: "set-2" });
  });

  it("aborts a hanging hydration and keeps the cached fallback available", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    fetchMock.mockImplementation(() => pendingResponse());

    const hydration = adapter.hydrate();
    const rejected = expect(hydration).rejects.toMatchObject({
      name: "UserPreferencesClientError",
      operation: "load",
      message: "Settings could not be loaded. Local browser settings are being used."
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejected;

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    expect(adapter.getCached()).toEqual({});
    await expect(adapter.hydrate()).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out hydration when response headers arrive but the JSON body hangs", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => pendingResponseBody()
    } as unknown as Response);

    const hydration = adapter.hydrate();
    const rejected = expect(hydration).rejects.toMatchObject({
      name: "UserPreferencesClientError",
      operation: "load"
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejected;

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    expect(adapter.getCached()).toEqual({});
  });

  it("times out a hanging POST and then continues with the next queued write", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    fetchMock
      .mockImplementationOnce(() => pendingResponse())
      .mockResolvedValueOnce(jsonResponse({}));

    const firstWrite = adapter.persistPatch({ themeMode: "dark" });
    const secondWrite = adapter.persistPatch({ activeSetId: "set-2" });
    const firstRejected = expect(firstWrite).rejects.toMatchObject({
      name: "UserPreferencesClientError",
      operation: "save"
    });

    await vi.advanceTimersByTimeAsync(50);
    await firstRejected;
    await expect(secondWrite).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: { themeMode: "dark", activeSetId: "set-2" } })
    );
    expect(adapter.getCached()).toMatchObject({ themeMode: "dark", activeSetId: "set-2" });
  });

  it("reconciles the latest adapter-owned state after an abort-ignoring older POST settles late", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    const saveStatuses = vi.fn();
    adapter.subscribeSaveStatus(saveStatuses);
    let serverState: Record<string, unknown> = {};
    let settleFirst!: () => void;
    let requestIndex = 0;

    fetchMock.mockImplementation((_url: string, init: FetchInit) => {
      const payload = JSON.parse(String(init.body)) as {
        preferences: Record<string, unknown>;
      };
      const applyRequest = () => {
        serverState = applyServerPreferencePatch(serverState, payload.preferences);
      };
      requestIndex += 1;
      if (requestIndex === 1) {
        return new Promise<Response>((resolve) => {
          settleFirst = () => {
            applyRequest();
            resolve(jsonResponse({}));
          };
        });
      }
      applyRequest();
      return Promise.resolve(jsonResponse({}));
    });

    const staleWrite = adapter.persistPatch({
      themeMode: "dark",
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });
    const latestWrite = adapter.persistPatch({
      themeMode: "light",
      setLayouts: { "set-1": {} }
    });
    const staleRejected = expect(staleWrite).rejects.toBeInstanceOf(
      UserPreferencesClientError
    );

    await vi.advanceTimersByTimeAsync(50);
    await staleRejected;
    await expect(latestWrite).resolves.toBeUndefined();
    expect(serverState).toEqual({ themeMode: "light" });
    const statusCountBeforeLateSettlement = saveStatuses.mock.calls.length;

    settleFirst();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(serverState).toEqual({ themeMode: "light" }));

    expect((fetchMock.mock.calls[2]?.[1] as FetchInit).body).toBe(
      JSON.stringify({
        preferences: { themeMode: "light", setLayouts: { "set-1": {} } }
      })
    );
    expect(saveStatuses.mock.calls.length).toBeGreaterThan(statusCountBeforeLateSettlement);
    expect(saveStatuses).toHaveBeenLastCalledWith(null);
  });

  it("does not replay a current write that succeeds after its timeout", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    const saveStatuses = vi.fn();
    adapter.subscribeSaveStatus(saveStatuses);
    let settleTimedOutWrite!: () => void;

    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        settleTimedOutWrite = () => resolve(jsonResponse({}));
      }))
      .mockResolvedValueOnce(jsonResponse({}));

    const timedOutWrite = adapter.persistPatch({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });
    const rejected = expect(timedOutWrite).rejects.toBeInstanceOf(
      UserPreferencesClientError
    );
    await vi.advanceTimersByTimeAsync(50);
    await rejected;

    settleTimedOutWrite();
    await vi.waitFor(() => expect(saveStatuses).toHaveBeenLastCalledWith(null));

    await expect(adapter.persistPatch({ themeMode: "light" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: { themeMode: "light" } })
    );
  });

  it("preserves unrelated recovery fields when an older timed-out write settles late", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    const saveStatuses = vi.fn();
    adapter.subscribeSaveStatus(saveStatuses);
    let serverState: Record<string, unknown> = {};
    let settleFirstWrite!: () => void;
    let requestIndex = 0;

    fetchMock.mockImplementation((_url: string, init: FetchInit) => {
      const payload = JSON.parse(String(init.body)) as {
        preferences: Record<string, unknown>;
      };
      requestIndex += 1;
      if (requestIndex === 1) {
        return new Promise<Response>((resolve) => {
          settleFirstWrite = () => {
            serverState = applyServerPreferencePatch(serverState, payload.preferences);
            resolve(jsonResponse({}));
          };
        });
      }
      if (requestIndex === 2) {
        return pendingResponse();
      }
      serverState = applyServerPreferencePatch(serverState, payload.preferences);
      return Promise.resolve(jsonResponse({}));
    });

    const firstWrite = adapter.persistPatch({ themeMode: "dark" });
    const secondWrite = adapter.persistPatch({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });
    const firstRejected = expect(firstWrite).rejects.toBeInstanceOf(
      UserPreferencesClientError
    );
    const secondRejected = expect(secondWrite).rejects.toBeInstanceOf(
      UserPreferencesClientError
    );

    await vi.advanceTimersByTimeAsync(50);
    await firstRejected;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(50);
    await secondRejected;

    settleFirstWrite();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as FetchInit).body))).toEqual({
      preferences: { themeMode: "dark" }
    });
    expect(serverState).toEqual({ themeMode: "dark" });
    expect(saveStatuses.mock.calls.at(-1)?.[0]).toBeInstanceOf(
      UserPreferencesClientError
    );

    await expect(adapter.persistPatch({ themeMode: "light" })).resolves.toBeUndefined();
    expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as FetchInit).body))).toEqual({
      preferences: {
        themeMode: "light",
        setLayouts: { "set-1": { workItemOrder: [1, 2] } }
      }
    });
    expect(serverState).toEqual({
      themeMode: "light",
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });
    expect(saveStatuses).toHaveBeenLastCalledWith(null);
  });

  it("does not replay unrelated history over newer external state during late reconciliation", async () => {
    vi.useFakeTimers();
    adapter = new HttpUserPreferencesAdapter({ requestTimeoutMs: 50 });
    let serverState: Record<string, unknown> = {
      themeMode: "system",
      sets: [{ id: "old-set" }],
      activeSetId: "old-set",
      adoContext: { organization: "old-org", project: "old-project" }
    };
    let settleFirstPost!: () => void;
    let postIndex = 0;

    fetchMock.mockImplementation((_url: string, init: FetchInit) => {
      if (init.method === "GET") {
        return Promise.resolve(jsonResponse({ preferences: serverState }));
      }

      const payload = JSON.parse(String(init.body)) as {
        preferences: Record<string, unknown>;
      };
      const applyRequest = () => {
        serverState = applyServerPreferencePatch(serverState, payload.preferences);
      };
      postIndex += 1;
      if (postIndex === 1) {
        return new Promise<Response>((resolve) => {
          settleFirstPost = () => {
            applyRequest();
            resolve(jsonResponse({}));
          };
        });
      }
      applyRequest();
      return Promise.resolve(jsonResponse({}));
    });

    await adapter.hydrate();
    const staleWrite = adapter.persistPatch({ themeMode: "dark" });
    const latestWrite = adapter.persistPatch({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });
    const staleRejected = expect(staleWrite).rejects.toBeInstanceOf(
      UserPreferencesClientError
    );

    await vi.advanceTimersByTimeAsync(50);
    await staleRejected;
    await expect(latestWrite).resolves.toBeUndefined();

    serverState = {
      ...serverState,
      sets: [{ id: "new-set" }],
      activeSetId: "new-set",
      adoContext: { organization: "new-org", project: "new-project" },
      setLayouts: { "set-1": { workItemOrder: [9, 8] } }
    };
    settleFirstPost();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect((fetchMock.mock.calls[3]?.[1] as FetchInit).body).toBe(
      JSON.stringify({
        preferences: { themeMode: "dark" }
      })
    );
    await vi.waitFor(() => expect(serverState).toMatchObject({
      themeMode: "dark",
      sets: [{ id: "new-set" }],
      activeSetId: "new-set",
      adoContext: { organization: "new-org", project: "new-project" },
      setLayouts: { "set-1": { workItemOrder: [9, 8] } }
    }));
  });

  it("ignores invalid keyed entries without deleting cached preferences", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        preferences: {
          setLayouts: { "set-1": { workItemOrder: [1, 2] } },
          setFilters: { "set-1": { workItems: { states: ["Active"] } } }
        }
      }))
      .mockResolvedValue(jsonResponse({}));
    await adapter.hydrate();

    const persisted = adapter.persistPatch({
      setLayouts: { "set-1": { version: 2 } as never },
      setFilters: { "set-1": { workItems: { states: "future" } } as never }
    });

    await expect(persisted).resolves.toBeUndefined();
    expect(adapter.getCached().setLayouts).toEqual({
      "set-1": { workItemOrder: [1, 2] }
    });
    expect(adapter.getCached().setFilters).toEqual({
      "set-1": { workItems: { states: ["Active"] } }
    });
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({ preferences: {} })
    );
  });

  it("replays a failed keyed-scope deletion before reporting a later write as saved", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({}));

    const deletion = adapter.persistPatch({ setLayouts: { "set-1": {} } });
    const laterWrite = adapter.persistPatch({ themeMode: "light" });

    await expect(deletion).rejects.toBeInstanceOf(UserPreferencesClientError);
    await expect(laterWrite).resolves.toBeUndefined();
    expect((fetchMock.mock.calls[1]?.[1] as FetchInit).body).toBe(
      JSON.stringify({
        preferences: { setLayouts: { "set-1": {} }, themeMode: "light" }
      })
    );
  });

  it("persistPatch merges setLayouts per setId without clobbering siblings", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const firstWrite = adapter.persistPatch({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    const secondWrite = adapter.persistPatch({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });

    expect(adapter.getCached().setLayouts).toEqual({
      "set-1": { workItemOrder: [1, 2] },
      "set-2": { workItemOrder: [10, 20] }
    });
    await expect(firstWrite).resolves.toBeUndefined();
    await expect(secondWrite).resolves.toBeUndefined();
  });

  it("persistPatch deletes a single setLayouts entry on an empty value while keeping siblings", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const firstWrite = adapter.persistPatch({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    const secondWrite = adapter.persistPatch({ setLayouts: { "set-1": {} } });

    expect(adapter.getCached().setLayouts).toEqual({
      "set-2": { workItemOrder: [10, 20] }
    });
    await expect(firstWrite).resolves.toBeUndefined();
    await expect(secondWrite).resolves.toBeUndefined();
  });
});

function pendingResponse(): Promise<Response> {
  return new Promise<Response>(() => {
    // Intentionally ignores AbortSignal to verify the explicit timeout race.
  });
}

function pendingResponseBody(): Promise<never> {
  return new Promise<never>(() => {
    // Headers have arrived, but parsing never completes and ignores abort.
  });
}

function applyServerPreferencePatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...current, ...patch };
  if (isRecord(patch.setLayouts)) {
    const layouts = isRecord(current.setLayouts) ? { ...current.setLayouts } : {};
    for (const [setId, value] of Object.entries(patch.setLayouts)) {
      if (isRecord(value) && Object.keys(value).length === 0) {
        delete layouts[setId];
      } else {
        layouts[setId] = value;
      }
    }
    if (Object.keys(layouts).length > 0) {
      next.setLayouts = layouts;
    } else {
      delete next.setLayouts;
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
