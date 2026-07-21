import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UserPreferencesClientError,
  type UserPreferencesClientPort
} from "../../application/ports/client/user-preferences-client.port.js";

import {
  getCachedUserPreferences,
  getUserPreferencesSyncStatus,
  hydrateUserPreferences,
  installUserPreferencesPort,
  isUserPreferencesCacheAuthoritative,
  persistUserPreferencesPatch,
  resetUserPreferencesCacheForTests,
  subscribeUserPreferencesSyncStatus
} from "./user-preferences.client.js";

type PortStub = {
  getCached: ReturnType<typeof vi.fn>;
  hydrate: ReturnType<typeof vi.fn>;
  persistPatch: ReturnType<typeof vi.fn>;
};

function createPortStub(): UserPreferencesClientPort & PortStub {
  const stub: PortStub = {
    getCached: vi.fn().mockReturnValue({ themeMode: "dark" as const }),
    hydrate: vi.fn().mockResolvedValue({ themeMode: "dark" as const }),
    persistPatch: vi.fn().mockResolvedValue(undefined)
  };
  return stub as unknown as UserPreferencesClientPort & PortStub;
}

describe("user-preferences.client facade", () => {
  beforeEach(() => {
    resetUserPreferencesCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetUserPreferencesCacheForTests();
  });

  it("returns an empty snapshot before any port is installed", () => {
    expect(getCachedUserPreferences()).toEqual({});
  });

  it("delegates getCached to the installed port", () => {
    const port = createPortStub();
    installUserPreferencesPort(port);

    expect(getCachedUserPreferences()).toEqual({ themeMode: "dark" });
    expect(port.getCached).toHaveBeenCalledTimes(1);
  });

  it("delegates hydrate to the installed port", async () => {
    const port = createPortStub();
    installUserPreferencesPort(port);

    await expect(hydrateUserPreferences()).resolves.toEqual({ themeMode: "dark" });
    expect(port.hydrate).toHaveBeenCalledTimes(1);
    expect(isUserPreferencesCacheAuthoritative()).toBe(true);
  });

  it("delegates persistPatch to the installed port", () => {
    const port = createPortStub();
    installUserPreferencesPort(port);

    persistUserPreferencesPatch({ themeMode: "light" });

    expect(port.persistPatch).toHaveBeenCalledWith({ themeMode: "light" });
  });

  it("falls back to the cache and publishes an understandable hydration error", async () => {
    const port = createPortStub();
    port.getCached.mockReturnValue({ themeMode: "light" });
    port.hydrate.mockRejectedValue(new UserPreferencesClientError(
      "load",
      "Settings could not be loaded. Local browser settings are being used."
    ));
    const listener = vi.fn();
    installUserPreferencesPort(port);
    const unsubscribe = subscribeUserPreferencesSyncStatus(listener);

    await expect(hydrateUserPreferences()).resolves.toEqual({ themeMode: "light" });

    expect(isUserPreferencesCacheAuthoritative()).toBe(false);

    expect(getUserPreferencesSyncStatus()).toEqual({
      loadError: "Settings could not be loaded. Local browser settings are being used.",
      saveError: null
    });
    await expect(hydrateUserPreferences()).resolves.toEqual({ themeMode: "light" });
    expect(port.hydrate).toHaveBeenCalledTimes(1);
    expect(isUserPreferencesCacheAuthoritative()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("publishes write failures and clears the error after a later write succeeds", async () => {
    const port = createPortStub();
    port.persistPatch
      .mockRejectedValueOnce(new UserPreferencesClientError(
        "save",
        "Settings could not be saved permanently. Your changes remain available in this browser."
      ))
      .mockResolvedValueOnce(undefined);
    installUserPreferencesPort(port);

    persistUserPreferencesPatch({ themeMode: "dark" });
    await vi.waitFor(() => expect(getUserPreferencesSyncStatus().saveError).not.toBeNull());

    expect(getUserPreferencesSyncStatus()).toEqual({
      loadError: null,
      saveError:
        "Settings could not be saved permanently. Your changes remain available in this browser."
    });

    persistUserPreferencesPatch({ themeMode: "light" });
    await vi.waitFor(() => expect(getUserPreferencesSyncStatus()).toEqual({
      loadError: null,
      saveError: null
    }));
  });

  it("publishes a fallback message when a port throws synchronously", () => {
    const port = createPortStub();
    port.persistPatch.mockImplementation(() => {
      throw new Error("unexpected transport failure");
    });
    installUserPreferencesPort(port);

    persistUserPreferencesPatch({ themeMode: "dark" });

    expect(getUserPreferencesSyncStatus()).toEqual({
      loadError: null,
      saveError:
        "Settings could not be saved permanently. Your changes remain available in this browser."
    });
  });

  it("keeps a hydration warning visible when a later write succeeds", async () => {
    const port = createPortStub();
    port.hydrate.mockRejectedValue(new UserPreferencesClientError(
      "load",
      "Settings could not be loaded. Local browser settings are being used."
    ));
    installUserPreferencesPort(port);

    await hydrateUserPreferences();
    persistUserPreferencesPatch({ themeMode: "dark" });
    await vi.waitFor(() => expect(port.persistPatch).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(getUserPreferencesSyncStatus()).toEqual({
      loadError: "Settings could not be loaded. Local browser settings are being used.",
      saveError: null
    });
  });

  it("reflects adapter-owned background reconciliation status", () => {
    const port = createPortStub();
    let publishStatus!: (error: UserPreferencesClientError | null) => void;
    port.subscribeSaveStatus = vi.fn((listener) => {
      publishStatus = listener;
      return () => {};
    });
    installUserPreferencesPort(port);

    publishStatus(new UserPreferencesClientError(
      "save",
      "Settings could not be saved permanently. Your changes remain available in this browser."
    ));
    expect(getUserPreferencesSyncStatus().saveError).toContain(
      "Settings could not be saved permanently."
    );

    publishStatus(null);
    expect(getUserPreferencesSyncStatus().saveError).toBeNull();
  });

  it("falls back to a no-op port after reset so suites start clean", () => {
    const port = createPortStub();
    installUserPreferencesPort(port);
    resetUserPreferencesCacheForTests();

    persistUserPreferencesPatch({ themeMode: "light" });

    expect(port.persistPatch).not.toHaveBeenCalled();
    expect(getCachedUserPreferences()).toEqual({});
    expect(isUserPreferencesCacheAuthoritative()).toBe(false);
  });
});
