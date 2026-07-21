// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { formatRelativeTimestamp, WorkspaceToolbar } from "./workspace-toolbar.js";

describe("formatRelativeTimestamp", () => {
  const now = Date.parse("2026-07-21T10:00:00.000Z");

  it("formats short and long elapsed times compactly", () => {
    expect(formatRelativeTimestamp("2026-07-21T09:59:30.000Z", now)).toBe("30s ago");
    expect(formatRelativeTimestamp("2026-07-21T09:45:00.000Z", now)).toBe("15m ago");
    expect(formatRelativeTimestamp("2026-07-19T10:00:00.000Z", now)).toBe("2d ago");
  });
});

describe("WorkspaceToolbar mobile column switch", () => {
  it("uses semantic toggle buttons and supports arrow-key switching", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onMobileColumnChange = vi.fn();
    act(() => root.render(React.createElement(WorkspaceToolbar, {
      refreshControl: null,
      loadedAt: "2026-07-21T10:00:00.000Z",
      testCaseCount: 4,
      workItemCount: 3,
      relationCount: 2,
      unlinkedTestCaseCount: 1,
      unlinkedWorkItemCount: 1,
      mobileColumn: "test-cases",
      onMobileColumnChange
    })));

    const group = host.querySelector<HTMLElement>('.relations-mobile-tabs[role="group"]')!;
    const buttons = group.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons[0].getAttribute("role")).toBeNull();
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");

    buttons[0].focus();
    act(() => buttons[0].dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true
    })));
    expect(onMobileColumnChange).toHaveBeenLastCalledWith("work-items");
    expect(document.activeElement).toBe(buttons[1]);

    act(() => buttons[1].dispatchEvent(new KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true
    })));
    expect(onMobileColumnChange).toHaveBeenLastCalledWith("test-cases");
    expect(document.activeElement).toBe(buttons[0]);

    act(() => root.unmount());
    host.remove();
  });
});
