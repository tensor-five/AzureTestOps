// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import type { ActiveSetSnapshotStreamEvent } from "../../application/ports/client/active-set-snapshot-client.port.js";
import type { UserPreferencesClientPort } from "../../application/ports/client/user-preferences-client.port.js";
import type { Set } from "../../domain/sets/set.js";
import { WithClientPorts, buildClientPortsStub } from "../../app/composition/test-client-ports.js";
import { AppShell } from "../../app/bootstrap/ui-client.js";
import { installUserPreferencesPort, resetUserPreferencesCacheForTests } from "../../shared/user-preferences/user-preferences.client.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const navigationCss = await readFile(path.resolve("src/app/bootstrap/local-ui-navigation.css"), "utf8");
const activeSet: Set = { id: "set-1", name: "Release 2.0", planId: "1", rootSuiteId: "1", queryId: "query-1" };

beforeEach(() => {
  const style = document.createElement("style");
  style.dataset.testNavigationCss = "";
  style.textContent = navigationCss;
  document.head.append(style);
});

afterEach(() => {
  document.querySelectorAll("style[data-test-navigation-css]").forEach((element) => element.remove());
  resetUserPreferencesCacheForTests();
  localStorage.clear();
  document.documentElement.dataset.themeMode = "";
  document.documentElement.dataset.theme = "";
  vi.restoreAllMocks();
});

describe("Refresh in der Kopfzeile contract v1", () => {
  it("RHP-01 places the real Refresh button in the global header", async () => {
    const harness = await renderApp(activeSet);

    expect(harness.host.querySelector('.ui-shell-header button[aria-label="Refresh active set"]')).not.toBeNull();

    harness.unmount();
  });

  it("RHP-02 keeps the real Refresh button visible with the sticky global header", async () => {
    const harness = await renderApp(null);
    const header = harness.host.querySelector<HTMLElement>(".ui-shell-header");

    expect(getComputedStyle(header!).position).toBe("sticky");
    expect(header?.querySelector('button[aria-label="Refresh active set"]')).not.toBeNull();

    harness.unmount();
  });

  it("RHP-03 preserves the accessible Refresh name, keyboard action, and disabled state", async () => {
    const withoutSet = await renderApp(null);
    expect(withoutSet.host.querySelector<HTMLButtonElement>(
      '.ui-shell-header button[aria-label="Refresh active set"]'
    )?.disabled).toBe(true);
    withoutSet.unmount();

    const harness = await renderApp(activeSet);
    harness.emit({ type: "error", message: "Azure DevOps is unavailable" });
    await vi.waitFor(() => expect(harness.headerRefresh()?.disabled).toBe(false));

    harness.headerRefresh()?.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(harness.subscribe).toHaveBeenCalledTimes(2);

    harness.unmount();
  });

  it("RHP-04 keeps refresh progress and errors immediately next to the real header action", async () => {
    const harness = await renderApp(activeSet);
    harness.emit({ type: "progress", progress: { stage: "test-cases", done: 2, total: 4 } });

    await vi.waitFor(() => expect(harness.headerRefreshContainer()?.querySelector('[role="status"]')?.textContent)
      .toContain("Loading test cases"));

    harness.emit({ type: "error", message: "Azure DevOps is unavailable" });
    await vi.waitFor(() => expect(harness.headerRefreshContainer()?.querySelector('[role="alert"]')?.textContent)
      .toContain("Azure DevOps is unavailable"));

    harness.unmount();
  });

  it("RHP-05 keeps the update timestamp but removes the second Refresh action from the workspace toolbar", async () => {
    const harness = await renderApp(activeSet);
    harness.emit({ type: "result", snapshot: emptySnapshot() });

    await vi.waitFor(() => expect(harness.host.querySelector(".relations-workspace-toolbar")).not.toBeNull());
    expect(harness.host.querySelector(".relations-workspace-updated")).not.toBeNull();
    expect(harness.host.querySelector('.relations-workspace-toolbar button[aria-label="Refresh active set"]')).toBeNull();

    harness.unmount();
  });
});

async function renderApp(set: Set | null): Promise<{
  host: HTMLDivElement;
  subscribe: ReturnType<typeof vi.fn>;
  emit(event: ActiveSetSnapshotStreamEvent): void;
  headerRefresh(): HTMLButtonElement | null;
  headerRefreshContainer(): HTMLElement | null;
  unmount(): void;
}> {
  let onEvent: ((event: ActiveSetSnapshotStreamEvent) => void) | null = null;
  const subscribe = vi.fn((_setId: string, listener: (event: ActiveSetSnapshotStreamEvent) => void) => {
    onEvent = listener;
    return { close: () => undefined };
  });
  const userPreferences: UserPreferencesClientPort = {
    getCached: () => ({}),
    hydrate: vi.fn().mockResolvedValue({}),
    persistPatch: vi.fn().mockResolvedValue(undefined)
  };
  const ports = buildClientPortsStub({
    activeSetSnapshot: { subscribe },
    userPreferences,
    authPreflight: { check: vi.fn().mockResolvedValue("READY") },
    setManagement: {
      list: vi.fn().mockResolvedValue({ sets: set ? [set] : [], activeSetId: set?.id ?? null }),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), setActive: vi.fn()
    },
    adoContext: { getContext: vi.fn().mockResolvedValue(null), setContext: vi.fn(), getCliDefaults: vi.fn() }
  });
  installUserPreferencesPort(userPreferences);
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(<WithClientPorts ports={ports}><AppShell /></WithClientPorts>);
  });
  await vi.waitFor(() => expect(host.querySelector("main")?.hasAttribute("aria-busy")).toBe(false));
  if (set) {
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
  }
  return {
    host,
    subscribe,
    emit: (event) => act(() => onEvent?.(event)),
    headerRefresh: () => host.querySelector<HTMLButtonElement>('.ui-shell-header button[aria-label="Refresh active set"]'),
    headerRefreshContainer: () => host.querySelector<HTMLElement>(".ui-shell-header .relations-workspace-refresh"),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function emptySnapshot(): ActiveSetSnapshot {
  return {
    set: activeSet,
    suiteTree: { id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] },
    projections: [],
    workItemsFromQuery: [],
    loadedAt: "2026-08-26T12:00:00.000Z"
  };
}
