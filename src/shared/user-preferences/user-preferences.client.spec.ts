import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserPreferencesClientPort } from "../../application/ports/client/user-preferences-client.port.js";

import {
  getCachedUserPreferences,
  hydrateUserPreferences,
  installUserPreferencesPort,
  persistUserPreferencesPatch,
  resetUserPreferencesCacheForTests
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
    persistPatch: vi.fn()
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
  });

  it("delegates persistPatch to the installed port", () => {
    const port = createPortStub();
    installUserPreferencesPort(port);

    persistUserPreferencesPatch({ themeMode: "light" });

    expect(port.persistPatch).toHaveBeenCalledWith({ themeMode: "light" });
  });

  it("falls back to a no-op port after reset so suites start clean", () => {
    const port = createPortStub();
    installUserPreferencesPort(port);
    resetUserPreferencesCacheForTests();

    persistUserPreferencesPatch({ themeMode: "light" });

    expect(port.persistPatch).not.toHaveBeenCalled();
    expect(getCachedUserPreferences()).toEqual({});
  });
});
