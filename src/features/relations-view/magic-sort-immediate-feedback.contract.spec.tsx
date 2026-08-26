// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MagicSortAction, type MagicSortActionProps } from "./magic-sort-action.js";
import type { MagicSortInput, MagicSortLayout } from "./magic-sort-layout.js";
import { useMagicSort } from "./use-magic-sort.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const navigationCss = await readFile(path.resolve("src/app/bootstrap/local-ui-navigation.css"), "utf8");
type ConfirmedActionProps = Omit<MagicSortActionProps, "feedbackState"> & { feedbackState: "confirmed"; progress: number };
const ConfirmedMagicSortAction = MagicSortAction as unknown as React.ComponentType<ConfirmedActionProps>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Magic Sort immediate feedback contract v2", () => {
  it("MSF-06 confirms an immediate Magic Sort click with a short magic effect and no progress bar", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(React.createElement(ConfirmedMagicSortAction, {
      onStart: () => undefined,
      isRunning: false,
      status: "Magic Sort completed the layout optimization.",
      progress: 0,
      feedbackState: "confirmed"
    })));

    expect(host.querySelector(".ui-shell-magic-sort")?.classList.contains("is-magic-confirmed")).toBe(true);
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(navigationCss).toMatch(/@keyframes\s+ui-shell-magic-confirm/);
    act(() => root.unmount());
  });

  it("MSF-06 starts and clears immediate confirmation automatically, but suppresses it for reduced motion", () => {
    vi.useFakeTimers();
    const normal = renderHarness(false);
    act(() => normal.host.querySelector<HTMLButtonElement>("button")?.click());
    expect(normal.host.querySelector("output")?.textContent).toBe("confirmed:0");
    act(() => vi.advanceTimersByTime(650));
    expect(normal.host.querySelector("output")?.textContent).toBe("idle:0");
    normal.unmount();

    const reducedMotion = renderHarness(true);
    act(() => reducedMotion.host.querySelector<HTMLButtonElement>("button")?.click());
    expect(reducedMotion.host.querySelector("output")?.textContent).toBe("idle:0");
    reducedMotion.unmount();
  });
});

function renderHarness(reduceMotion: boolean): { host: HTMLDivElement; unmount(): void } {
  vi.stubGlobal("matchMedia", () => ({ matches: reduceMotion }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(ImmediateFeedbackHarness)));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function ImmediateFeedbackHarness(): React.ReactElement {
  const magicSort = useMagicSort({
    input: immediateInput(),
    applyLayout: (_layout: MagicSortLayout) => undefined
  }) as ReturnType<typeof useMagicSort> & { feedbackState: "idle" | "confirmed"; progress: number };
  return React.createElement(React.Fragment, null,
    React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort"),
    React.createElement("output", null, `${magicSort.feedbackState}:${magicSort.progress}`)
  );
}

function immediateInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 }
    ],
    workItemIds: [201, 202],
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [102] }
    ]
  };
}
