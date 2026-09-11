// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MagicSortAction } from "./magic-sort-action.js";
import type { MagicSortInput, MagicSortLayout } from "./magic-sort-layout.js";
import { useMagicSort } from "./use-magic-sort.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Magic Sort feedback after instant-apply supersession", () => {
  it("MSI-06 replaces running progress with immediate confirmation", () => {
    vi.useFakeTimers();
    const harness = renderFeedbackHarness(false, sortableInput());

    act(() => harness.host.querySelector<HTMLButtonElement>("button")?.click());

    expect(harness.host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
    expect(harness.host.querySelector('[role="progressbar"]')).toBeNull();
    expect(harness.host.querySelector("output")?.textContent).toBe("confirmed:0:false");
    expect(harness.host.querySelector('[role="status"]')?.textContent).toMatch(/completed|abgeschlossen|fertig/i);
    harness.unmount();
  });

  it("MSI-06 clears the short confirmation automatically", () => {
    vi.useFakeTimers();
    const harness = renderFeedbackHarness(false, sortableInput());
    act(() => harness.host.querySelector<HTMLButtonElement>("button")?.click());
    expect(harness.host.querySelector("output")?.textContent).toBe("confirmed:0:false");

    act(() => vi.advanceTimersByTime(650));

    expect(harness.host.querySelector("output")?.textContent).toBe("idle:0:false");
    harness.unmount();
  });

  it("MSI-06 and MSI-08 suppress animation for reduced motion while retaining completion", () => {
    const harness = renderFeedbackHarness(true, sortableInput());

    act(() => harness.host.querySelector<HTMLButtonElement>("button")?.click());

    expect(harness.host.querySelector('[role="progressbar"]')).toBeNull();
    expect(harness.host.querySelector("output")?.textContent).toBe("idle:0:false");
    expect(harness.host.querySelector('[role="status"]')?.textContent).toMatch(/completed|abgeschlossen|fertig/i);
    harness.unmount();
  });
});

function renderFeedbackHarness(
  reduceMotion: boolean,
  input: MagicSortInput
): { host: HTMLDivElement; unmount(): void } {
  vi.stubGlobal("matchMedia", () => ({ matches: reduceMotion }));
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

function FeedbackHarness(props: { input: MagicSortInput }): React.ReactElement {
  const magicSort = useMagicSort({
    input: props.input,
    applyLayout: (_layout: MagicSortLayout) => undefined
  });
  return React.createElement(React.Fragment, null,
    React.createElement(MagicSortAction, {
      onStart: magicSort.start,
      isRunning: magicSort.isRunning,
      status: magicSort.status,
      progress: magicSort.progress,
      feedbackState: magicSort.feedbackState
    }),
    React.createElement("output", null, `${magicSort.feedbackState}:${magicSort.progress}:${magicSort.isRunning}`)
  );
}

function sortableInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [103, 102, 101] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 },
      { kind: "test-case", suiteId: 11, testCaseId: 103 }
    ],
    workItemIds: [201, 202, 203],
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [102] },
      { id: 203, relatedTestCaseIds: [103] }
    ]
  };
}
