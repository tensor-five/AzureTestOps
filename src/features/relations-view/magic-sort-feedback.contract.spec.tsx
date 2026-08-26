// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MagicSortAction, type MagicSortActionProps } from "./magic-sort-action.js";
import { type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { useMagicSort } from "./use-magic-sort.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigationCss = await readFile(path.resolve("src/app/bootstrap/local-ui-navigation.css"), "utf8");
type FeedbackState = "idle" | "running" | "complete";
type FeedbackActionProps = MagicSortActionProps & { progress: number; feedbackState: FeedbackState };
const FeedbackMagicSortAction = MagicSortAction as unknown as React.ComponentType<FeedbackActionProps>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Magic Sort feedback contract v1", () => {
  it("MSF-01 renders a progress bar inside the running Magic Sort button", () => {
    const harness = renderAction({ isRunning: true, progress: 60, feedbackState: "running" });
    const progress = harness.host.querySelector<HTMLElement>('[role="progressbar"]');

    expect(progress?.getAttribute("aria-valuenow")).toBe("60");
    expect(progress?.getAttribute("aria-valuemin")).toBe("0");
    expect(progress?.getAttribute("aria-valuemax")).toBe("100");
    expect(harness.host.querySelector(".ui-shell-magic-sort-progress-bar")?.getAttribute("style"))
      .toContain("60%");
    expect(harness.host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    harness.unmount();
  });

  it("MSF-02 applies a bounded magic colour effect while Magic Sort is running", () => {
    const harness = renderAction({ isRunning: true, progress: 40, feedbackState: "running" });

    expect(harness.host.querySelector(".ui-shell-magic-sort")?.classList.contains("is-magic-running"))
      .toBe(true);
    expect(navigationCss).toMatch(/@keyframes\s+ui-shell-magic-sweep/);
    expect(navigationCss).toMatch(/prefers-reduced-motion:\s*reduce/);
    harness.unmount();
  });

  it("MSF-03 advances to completion for accepted live optimization steps and then clears the effect", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(React.createElement(FeedbackHarness)));
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    expect(host.querySelector("output")?.textContent).toBe("running:0");

    act(() => vi.advanceTimersByTime(120));
    expect(host.querySelector("output")?.textContent).toBe("running:33");
    act(() => vi.advanceTimersByTime(120));
    expect(host.querySelector("output")?.textContent).toBe("running:67");
    act(() => vi.advanceTimersByTime(120));
    expect(host.querySelector("output")?.textContent).toBe("running:100");
    act(() => vi.advanceTimersByTime(120));
    expect(host.querySelector("output")?.textContent).toBe("complete:100");
    act(() => vi.advanceTimersByTime(650));
    expect(host.querySelector("output")?.textContent).toBe("idle:0");
    act(() => root.unmount());
  });

  it("MSF-04 does not show a running effect for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const reducedMotion = renderFeedbackHarness(feedbackInput());
    act(() => reducedMotion.host.querySelector<HTMLButtonElement>("button")?.click());
    expect(reducedMotion.host.querySelector("output")?.textContent).toBe("idle:0");
    reducedMotion.unmount();

    const harness = renderAction({ isRunning: false, progress: 0, feedbackState: "idle" });

    expect(harness.host.querySelector('[role="progressbar"]')).toBeNull();
    expect(harness.host.querySelector(".is-magic-running")).toBeNull();
    harness.unmount();
  });
});

function renderAction(overrides: Partial<FeedbackActionProps>): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(FeedbackMagicSortAction, {
    onStart: () => undefined,
    isRunning: false,
    status: "",
    progress: 0,
    feedbackState: "idle",
    ...overrides
  })));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function FeedbackHarness(props: { input?: MagicSortInput }): React.ReactElement {
  const magicSort = useMagicSort({
    input: props.input ?? feedbackInput(),
    applyLayout: (_layout: MagicSortLayout) => undefined
  }) as ReturnType<typeof useMagicSort> & { progress: number; feedbackState: FeedbackState };
  return React.createElement(React.Fragment, null,
    React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort"),
    React.createElement("output", null, `${magicSort.feedbackState}:${magicSort.progress}`)
  );
}

function renderFeedbackHarness(input: MagicSortInput): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(FeedbackHarness, { input })));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function feedbackInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [103, 102, 101] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 },
      { kind: "test-case", suiteId: 11, testCaseId: 103 }
    ],
    workItemIds: [101, 202, 303],
    workItems: [
      { id: 101, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [102] },
      { id: 303, relatedTestCaseIds: [103] }
    ]
  };
}
