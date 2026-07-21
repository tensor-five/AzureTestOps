// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUserPreferenceStore } from "./create-user-preference-store.js";
import * as preferencesClient from "./user-preferences.client.js";
import type { UserPreferences } from "./user-preferences.schema.js";

type SampleValue = { count: number };

function buildSampleStore() {
  return createUserPreferenceStore<SampleValue>({
    storageKey: "test-store.v1",
    readFromServerCache: (preferences, scopeKey) => {
      const cache = (preferences as { samples?: Record<string, SampleValue> }).samples;
      if (!cache) {
        return null;
      }
      return cache[scopeKey ?? "__global__"] ?? null;
    },
    sanitize: (value) => {
      if (typeof value !== "object" || value === null) {
        return null;
      }
      const count = (value as { count?: unknown }).count;
      if (typeof count !== "number" || !Number.isFinite(count)) {
        return null;
      }
      return { count };
    },
    buildPatch: (value, _cached, scopeKey) => {
      const target = scopeKey ?? "__global__";
      return {
        samples: { [target]: value }
      } as Partial<UserPreferences>;
    }
  });
}

describe("createUserPreferenceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
    vi.spyOn(preferencesClient, "isUserPreferencesCacheAuthoritative").mockReturnValue(false);
    vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("load returns null when neither server cache nor localStorage has a value", () => {
    const store = buildSampleStore();
    expect(store.load({ scopeKey: "scope-1" })).toBeNull();
  });

  it("load reads from the server cache and writes through to localStorage", () => {
    vi.mocked(preferencesClient.getCachedUserPreferences).mockReturnValue({
      samples: { "scope-1": { count: 7 } }
    } as UserPreferences);

    const store = buildSampleStore();
    expect(store.load({ scopeKey: "scope-1" })).toEqual({ count: 7 });
    expect(localStorage.getItem("test-store.v1::scope-1")).toBe(JSON.stringify({ count: 7 }));
  });

  it("load falls back to localStorage when the server cache misses", () => {
    localStorage.setItem("test-store.v1::scope-1", JSON.stringify({ count: 9 }));

    const store = buildSampleStore();
    expect(store.load({ scopeKey: "scope-1" })).toEqual({ count: 9 });
  });

  it("does not revive a stale local value after authoritative lowdb hydration removed it", () => {
    const authoritySpy = vi.mocked(preferencesClient.isUserPreferencesCacheAuthoritative);
    const persistSpy = vi.mocked(preferencesClient.persistUserPreferencesPatch);
    localStorage.setItem("test-store.v1::scope-1", JSON.stringify({ count: 9 }));
    const store = buildSampleStore();

    expect(store.load({ scopeKey: "scope-1" })).toEqual({ count: 9 });

    authoritySpy.mockReturnValue(true);
    expect(store.load({ scopeKey: "scope-1" })).toBeNull();
    expect(localStorage.getItem("test-store.v1::scope-1")).toBeNull();

    store.save({ count: 5 }, { scopeKey: "scope-1" });
    expect(persistSpy).toHaveBeenCalledWith({ samples: { "scope-1": { count: 5 } } });
    expect(localStorage.getItem("test-store.v1::scope-1")).toBe(JSON.stringify({ count: 5 }));
  });

  it("replaces a stale local value with the value from authoritative lowdb hydration", () => {
    localStorage.setItem("test-store.v1::scope-1", JSON.stringify({ count: 9 }));
    vi.mocked(preferencesClient.getCachedUserPreferences).mockReturnValue({
      samples: { "scope-1": { count: 12 } }
    } as UserPreferences);
    vi.mocked(preferencesClient.isUserPreferencesCacheAuthoritative).mockReturnValue(true);
    const store = buildSampleStore();

    expect(store.load({ scopeKey: "scope-1" })).toEqual({ count: 12 });
    expect(localStorage.getItem("test-store.v1::scope-1")).toBe(JSON.stringify({ count: 12 }));
  });

  it("save sanitizes input, calls persistUserPreferencesPatch with buildPatch, and mirrors to localStorage", () => {
    const persistSpy = vi.mocked(preferencesClient.persistUserPreferencesPatch);
    const store = buildSampleStore();

    store.save({ count: 5 }, { scopeKey: "scope-1" });

    expect(persistSpy).toHaveBeenCalledWith({ samples: { "scope-1": { count: 5 } } });
    expect(localStorage.getItem("test-store.v1::scope-1")).toBe(JSON.stringify({ count: 5 }));
  });

  it("save skips persistence when sanitize returns null", () => {
    const persistSpy = vi.mocked(preferencesClient.persistUserPreferencesPatch);
    const store = buildSampleStore();

    store.save({ count: Number.NaN } as SampleValue, { scopeKey: "scope-1" });

    expect(persistSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("test-store.v1::scope-1")).toBeNull();
  });

  it("buildPatch receives the cached preferences so callers can merge sibling scopes", () => {
    const persistSpy = vi.mocked(preferencesClient.persistUserPreferencesPatch);
    vi.mocked(preferencesClient.getCachedUserPreferences).mockReturnValue({
      samples: { "scope-2": { count: 1 } }
    } as UserPreferences);

    const merging = createUserPreferenceStore<SampleValue>({
      storageKey: "merge-store.v1",
      readFromServerCache: () => null,
      sanitize: (value) => (typeof value === "object" && value !== null ? (value as SampleValue) : null),
      buildPatch: (value, cached, scopeKey) => {
        const target = scopeKey ?? "__global__";
        const samples = (cached as { samples?: Record<string, SampleValue> }).samples ?? {};
        return { samples: { ...samples, [target]: value } } as Partial<UserPreferences>;
      }
    });

    merging.save({ count: 4 }, { scopeKey: "scope-1" });

    expect(persistSpy).toHaveBeenCalledWith({
      samples: { "scope-2": { count: 1 }, "scope-1": { count: 4 } }
    });
  });

  it("hydrate fires the callback only once per scope", async () => {
    const hydrateSpy = vi
      .spyOn(preferencesClient, "hydrateUserPreferences")
      .mockResolvedValue({ samples: { "scope-1": { count: 11 } } } as UserPreferences);
    const onHydrated = vi.fn();
    const store = buildSampleStore();

    store.hydrate(onHydrated, { scopeKey: "scope-1" });
    await Promise.resolve();
    await Promise.resolve();

    expect(hydrateSpy).toHaveBeenCalledTimes(1);
    expect(onHydrated).toHaveBeenCalledWith({ count: 11 });

    store.hydrate(onHydrated, { scopeKey: "scope-1" });
    expect(hydrateSpy).toHaveBeenCalledTimes(1);
  });

  it("clearForTests wipes memory and the matching localStorage entries", () => {
    localStorage.setItem("test-store.v1", JSON.stringify({ count: 1 }));
    localStorage.setItem("test-store.v1::scope-1", JSON.stringify({ count: 2 }));
    localStorage.setItem("unrelated", "keep-me");

    const store = buildSampleStore();
    store.clearForTests();

    expect(localStorage.getItem("test-store.v1")).toBeNull();
    expect(localStorage.getItem("test-store.v1::scope-1")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep-me");
  });

  it("normalises whitespace-only scope keys to the global scope", () => {
    const persistSpy = vi.mocked(preferencesClient.persistUserPreferencesPatch);
    const store = buildSampleStore();

    store.save({ count: 3 }, { scopeKey: "   " });

    expect(persistSpy).toHaveBeenCalledWith({ samples: { "__global__": { count: 3 } } });
    expect(localStorage.getItem("test-store.v1")).toBe(JSON.stringify({ count: 3 }));
  });
});
