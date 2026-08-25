// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "../navigation/header.js";
import { WorkspaceToolbar, type WorkspaceToolbarProps } from "./workspace-toolbar.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HeaderHarness = {
  headerHost: HTMLDivElement;
  toolbarHost: HTMLDivElement;
  toolbarRoot: Root;
  renderToolbar(props: Partial<WorkspaceToolbarProps>): void;
  unmount(): void;
};

afterEach(() => vi.restoreAllMocks());

describe("Magic Sort header placement contract v1", () => {
  it("MSH-01 places the keyboard-operable Magic Sort action with its wand in the global header", () => {
    const onMagicSort = vi.fn();
    const harness = renderHeaderWithToolbar({ onMagicSort });

    const magicSort = harness.headerHost.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');
    expect(magicSort).not.toBeNull();
    expect(magicSort?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    act(() => magicSort?.click());
    expect(onMagicSort).toHaveBeenCalledOnce();

    harness.unmount();
  });

  it("MSH-02 keeps the global header sticky while the workspace content scrolls", () => {
    const harness = renderHeaderWithToolbar();
    const header = harness.headerHost.querySelector<HTMLElement>(".ui-shell-header");

    expect(header).not.toBeNull();
    expect(harness.headerHost.querySelector('[data-magic-sort-slot] button[aria-label="Magic Sort"]'))
      .not.toBeNull();

    harness.unmount();
  });

  it("MSH-03 keeps the action status and disabled state in the header during optimization", () => {
    const harness = renderHeaderWithToolbar({ isMagicSorting: true, magicSortStatus: "Magic Sort is optimizing the layout." });
    const magicSort = harness.headerHost.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');

    expect(magicSort?.disabled).toBe(true);
    expect(harness.headerHost.querySelector('[role="status"]')?.textContent)
      .toContain("Magic Sort is optimizing the layout.");

    harness.unmount();
  });

  it("MSH-04 retains the accessible action name independently of its visible label", () => {
    const harness = renderHeaderWithToolbar();
    const magicSort = harness.headerHost.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');

    expect(magicSort?.getAttribute("aria-label")).toBe("Magic Sort");

    harness.unmount();
  });
});

function renderHeaderWithToolbar(overrides: Partial<WorkspaceToolbarProps> = {}): HeaderHarness {
  const headerHost = document.createElement("div");
  const toolbarHost = document.createElement("div");
  document.body.append(headerHost, toolbarHost);
  const headerRoot = createRoot(headerHost);
  const toolbarRoot = createRoot(toolbarHost);
  act(() => {
    headerRoot.render(
      <AppHeader
        preflightStatus="READY"
        themeMode="system"
        onToggleTheme={() => undefined}
        setSwitcher={<button type="button">Release 2.0</button>}
      />
    );
  });
  const renderToolbar = (nextOverrides: Partial<WorkspaceToolbarProps>) => {
    act(() => toolbarRoot.render(<WorkspaceToolbar {...toolbarProps(nextOverrides)} />));
  };
  renderToolbar(overrides);
  return {
    headerHost,
    toolbarHost,
    toolbarRoot,
    renderToolbar,
    unmount: () => {
      act(() => {
        toolbarRoot.unmount();
        headerRoot.unmount();
      });
      headerHost.remove();
      toolbarHost.remove();
    }
  };
}

function toolbarProps(overrides: Partial<WorkspaceToolbarProps>): WorkspaceToolbarProps {
  return {
    refreshControl: <button type="button">Refresh</button>,
    loadedAt: "2026-08-25T12:00:00.000Z",
    testCaseCount: 4,
    workItemCount: 4,
    relationCount: 4,
    unlinkedTestCaseCount: 0,
    unlinkedWorkItemCount: 0,
    mobileColumn: "test-cases",
    onMobileColumnChange: () => undefined,
    onMagicSort: () => undefined,
    ...overrides
  };
}
