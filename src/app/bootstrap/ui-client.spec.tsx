// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UserPreferencesClientError,
  type UserPreferencesClientPort
} from "../../application/ports/client/user-preferences-client.port.js";
import { AppShell } from "./ui-client.js";
import { WithClientPorts, buildClientPortsStub } from "../composition/test-client-ports.js";
import {
  installUserPreferencesPort,
  resetUserPreferencesCacheForTests
} from "../../shared/user-preferences/user-preferences.client.js";
import type { UserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function buildRuntime(userPreferences: UserPreferencesClientPort) {
  const authCheck = vi.fn().mockResolvedValue("READY");
  const listSets = vi.fn().mockResolvedValue({ sets: [], activeSetId: null });
  const getContext = vi.fn().mockResolvedValue(null);
  const ports = buildClientPortsStub({
    userPreferences,
    authPreflight: { check: authCheck },
    setManagement: {
      list: listSets,
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setActive: vi.fn()
    },
    adoContext: {
      getContext,
      setContext: vi.fn(),
      getCliDefaults: vi.fn()
    }
  });
  return { ports, authCheck, listSets, getContext };
}

async function renderAppShell(userPreferences: UserPreferencesClientPort) {
  const runtime = buildRuntime(userPreferences);
  installUserPreferencesPort(userPreferences);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WithClientPorts ports={runtime.ports}>
        <AppShell />
      </WithClientPorts>
    );
  });
  return {
    ...runtime,
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    }
  };
}

describe("AppShell preference hydration", () => {
  afterEach(() => {
    resetUserPreferencesCacheForTests();
    localStorage.clear();
    document.documentElement.dataset.themeMode = "";
    document.documentElement.dataset.theme = "";
    vi.restoreAllMocks();
  });

  it("mounts layout consumers and performs the first theme write only after hydration", async () => {
    const hydration = deferred<UserPreferences>();
    const persistPatch = vi.fn().mockResolvedValue(undefined);
    const userPreferences: UserPreferencesClientPort = {
      getCached: () => ({}),
      hydrate: vi.fn(() => hydration.promise),
      persistPatch
    };
    const harness = await renderAppShell(userPreferences);

    expect(harness.host.textContent).toContain("Loading settings…");
    expect(harness.host.querySelector("main")?.getAttribute("aria-busy")).toBe("true");
    expect(harness.host.querySelector(".ui-shell-header")).not.toBeNull();
    expect(harness.host.querySelector(".ui-shell-footer")).not.toBeNull();
    expect(harness.host.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
    expect(harness.authCheck).not.toHaveBeenCalled();
    expect(harness.listSets).not.toHaveBeenCalled();
    expect(harness.getContext).not.toHaveBeenCalled();
    expect(persistPatch).not.toHaveBeenCalled();

    await act(async () => {
      hydration.resolve({ themeMode: "dark" });
      await hydration.promise;
    });

    expect(harness.authCheck).toHaveBeenCalledTimes(1);
    expect(harness.listSets).toHaveBeenCalledTimes(1);
    expect(harness.getContext).toHaveBeenCalledTimes(1);
    expect(persistPatch).toHaveBeenCalledWith({ themeMode: "dark" });
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(harness.host.querySelector("main")?.hasAttribute("aria-busy")).toBe(false);
    expect(harness.host.querySelector(".ui-shell-header")).not.toBeNull();
    expect(harness.host.querySelector(".ui-shell-footer")).not.toBeNull();

    harness.unmount();
  });

  it("continues with localStorage after hydration fails and shows an accessible warning", async () => {
    localStorage.setItem("azure-testops.theme-mode.v1", "dark");
    const pendingPersistence = deferred<void>();
    const userPreferences: UserPreferencesClientPort = {
      getCached: () => ({}),
      hydrate: vi.fn().mockRejectedValue(new UserPreferencesClientError(
        "load",
        "Settings could not be loaded. Local browser settings are being used."
      )),
      persistPatch: vi.fn(() => pendingPersistence.promise)
    };

    const harness = await renderAppShell(userPreferences);
    await vi.waitFor(() => expect(harness.authCheck).toHaveBeenCalledTimes(1));

    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(harness.host.querySelector("main")?.hasAttribute("aria-busy")).toBe(false);
    const warning = harness.host.querySelector<HTMLElement>('[role="alert"]');
    expect(warning?.textContent).toContain(
      "Settings could not be loaded. Local browser settings are being used."
    );

    harness.unmount();
  });

  it("does not revive a stale browser theme after authoritative hydration removed it", async () => {
    localStorage.setItem("azure-testops.theme-mode.v1", "dark");
    const persistPatch = vi.fn().mockResolvedValue(undefined);
    const userPreferences: UserPreferencesClientPort = {
      getCached: () => ({}),
      hydrate: vi.fn().mockResolvedValue({}),
      persistPatch
    };

    const harness = await renderAppShell(userPreferences);
    await vi.waitFor(() => expect(persistPatch).toHaveBeenCalledWith({ themeMode: "system" }));

    expect(document.documentElement.dataset.themeMode).toBe("system");
    expect(persistPatch).not.toHaveBeenCalledWith({ themeMode: "dark" });
    expect(localStorage.getItem("azure-testops.theme-mode.v1")).toBe("system");
    harness.unmount();
  });

  it("shows failed persistence and clears the warning after a later write succeeds", async () => {
    const persistPatch = vi.fn()
      .mockRejectedValueOnce(new UserPreferencesClientError(
        "save",
        "Settings could not be saved permanently. Your changes remain available in this browser."
      ))
      .mockResolvedValueOnce(undefined);
    const userPreferences: UserPreferencesClientPort = {
      getCached: () => ({ themeMode: "dark" }),
      hydrate: vi.fn().mockResolvedValue({ themeMode: "dark" }),
      persistPatch
    };

    const harness = await renderAppShell(userPreferences);
    await vi.waitFor(() => expect(harness.host.querySelector('[role="alert"]')).not.toBeNull());

    expect(harness.host.querySelector('[role="alert"]')?.textContent).toContain(
      "Settings could not be saved permanently."
    );

    const themeButton = harness.host.querySelector<HTMLButtonElement>(
      'button[aria-label^="Toggle theme"]'
    );
    expect(themeButton).not.toBeNull();
    await act(async () => {
      themeButton?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(harness.host.querySelector('[role="alert"]')).toBeNull());
    expect(persistPatch).toHaveBeenCalledTimes(2);

    harness.unmount();
  });
});
