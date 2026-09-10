// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MagicSortAction, type MagicSortActionProps } from "./magic-sort-action.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type DebugActionProps = MagicSortActionProps & {
  isDebugOpen: boolean;
  onDebugToggle(): void;
  debugReport: string | null;
  onCopyDebugReport(): void;
  debugCopyStatus: string;
};
const DebugAction = MagicSortAction as unknown as React.ComponentType<DebugActionProps>;

afterEach(() => document.body.replaceChildren());

describe("Magic-Sort-Debug-Bericht contract v2", () => {
  it("MSDR-01 renders an accessible icon-only bug action directly before Magic Sort", () => {
    const view = render({ isDebugOpen: false, debugReport: null, debugCopyStatus: "" });
    const bug = view.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort Debug"]');
    const magic = view.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');
    expect(bug).not.toBeNull();
    expect(bug?.textContent?.trim()).toBe("");
    expect(bug?.nextElementSibling).toBe(magic);
    view.unmount();
  });

  it("MSDR-02 toggles the transient report area without starting Magic Sort", () => {
    const onStart = vi.fn();
    const onDebugToggle = vi.fn();
    const view = render({ isDebugOpen: false, debugReport: null, debugCopyStatus: "", onStart, onDebugToggle });
    act(() => view.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort Debug"]')?.click());
    expect(onDebugToggle).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    view.unmount();
  });

  it("MSDR-02 and MSDR-05 open and close without persisting debug state", () => {
    const toggle = vi.fn();
    const first = render({ isDebugOpen: true, debugReport: null, debugCopyStatus: "", onDebugToggle: toggle });
    expect(first.host.querySelector('[data-magic-sort-debug-report]')).not.toBeNull();
    act(() => first.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort Debug"]')?.click());
    expect(toggle).toHaveBeenCalledOnce();
    first.unmount();
    const reloaded = render({ isDebugOpen: false, debugReport: null, debugCopyStatus: "" });
    expect(reloaded.host.querySelector('[data-magic-sort-debug-report]')).toBeNull();
    expect(localStorage.getItem("magic-sort-debug-report")).toBeNull();
    reloaded.unmount();
  });

  it("MSDR-03 renders the complete current JSON report and supports empty reports", () => {
    const empty = render({ isDebugOpen: true, debugReport: null, debugCopyStatus: "" });
    expect(empty.host.querySelector('[data-magic-sort-debug-report]')?.textContent ?? "").toContain("Noch kein Bericht");
    empty.unmount();

    const report = '{"schema":"magic-sort-debug.v1","summary":{"crossings":0}}';
    const filled = render({ isDebugOpen: true, debugReport: report, debugCopyStatus: "" });
    expect(filled.host.querySelector('[data-magic-sort-debug-report] pre')?.textContent).toBe(report);
    filled.unmount();
  });

  it("MSDR-04 disables Copy without a report and exposes copy feedback", () => {
    const copy = vi.fn();
    const empty = render({ isDebugOpen: true, debugReport: null, debugCopyStatus: "", onCopyDebugReport: copy });
    expect(empty.host.querySelector<HTMLButtonElement>('button[aria-label="Copy Magic Sort debug report"]')?.disabled).toBe(true);
    empty.unmount();

    const filled = render({ isDebugOpen: true, debugReport: "{}", debugCopyStatus: "Bericht kopiert", onCopyDebugReport: copy });
    act(() => filled.host.querySelector<HTMLButtonElement>('button[aria-label="Copy Magic Sort debug report"]')?.click());
    expect(copy).toHaveBeenCalledOnce();
    expect(filled.host.querySelector('[role="status"]')?.textContent).toContain("Bericht kopiert");
    filled.unmount();
  });

  it("MSDR-04 exposes an accessible copy error", () => {
    const view = render({ isDebugOpen: true, debugReport: "{}", debugCopyStatus: "Kopieren fehlgeschlagen" });
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain("Kopieren fehlgeschlagen");
    view.unmount();
  });
});

function render(overrides: Partial<DebugActionProps>): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(DebugAction, {
    onStart: () => undefined, isRunning: false, status: "", progress: 0, feedbackState: "idle",
    isDebugOpen: false, onDebugToggle: () => undefined, debugReport: null, onCopyDebugReport: () => undefined,
    debugCopyStatus: "", ...overrides
  })));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}
