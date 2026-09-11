// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MagicSortAction } from "./magic-sort-action.js";
import { planMagicSort, type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { useMagicSort } from "./use-magic-sort.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("approved instant Magic Sort contract", () => {
  it.each([false, true])(
    "MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is %s",
    (addSpacer) => {
      vi.useFakeTimers();
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      const input = sortableInput(addSpacer);
      const geometry = measuredGeometry();
      const plan = planMagicSort({ ...input, ...geometry });
      expect(plan.steps.length).toBeGreaterThan(1);
      const applyLayout = vi.fn<(layout: MagicSortLayout) => void>();
      const captureGeometry = vi.fn(() => geometry);
      const hook = renderHook(() => useMagicSort({ input, applyLayout, captureGeometry }));

      act(() => hook.result.current.start());

      expect(captureGeometry).toHaveBeenCalledOnce();
      expect(applyLayout).toHaveBeenCalledOnce();
      expect(applyLayout).toHaveBeenLastCalledWith(plan.steps.at(-1));
      expect(hook.result.current.isRunning).toBe(false);
      expect(hook.result.current.progress).toBe(0);
      expect(hook.result.current.feedbackState).toBe("confirmed");
      expect(hook.result.current.status).toMatch(/completed|abgeschlossen|fertig/i);

      act(() => vi.runAllTimers());
      expect(applyLayout).toHaveBeenCalledOnce();
      hook.unmount();
    }
  );

  it("MSI-06 and MSI-08 shows only a short confirmation after the completed layout", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(React.createElement(InstantActionHarness, { input: sortableInput(false) })));

    const action = host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');
    expect(action).not.toBeNull();
    act(() => action?.click());

    expect(action?.disabled).toBe(false);
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.querySelector("output")?.textContent).toBe("confirmed:0:false");
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/completed|abgeschlossen|fertig/i);

    act(() => vi.advanceTimersByTime(650));
    expect(host.querySelector("output")?.textContent).toBe("idle:0:false");
    act(() => root.unmount());
    host.remove();
  });

  it("MSI-04 applies filtered and collapsed-suite inputs immediately with Add Spacer", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const input: MagicSortInput = {
      suites: [{ suiteId: 11, testCaseIds: [103, 101] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 103 },
        { kind: "suite-header", suiteId: 12 }
      ],
      workItemIds: [201, 203],
      workItemPositions: { 201: 4, 203: 0 },
      workItems: [
        { id: 201, relatedTestCaseIds: [101] },
        { id: 203, relatedTestCaseIds: [103] }
      ],
      addSpacer: true
    };
    const finalLayout = planMagicSort({ ...input, ...measuredGeometry() }).steps.at(-1)!;
    const applyLayout = vi.fn();
    const hook = renderHook(() => useMagicSort({ input, captureGeometry: measuredGeometry, applyLayout }));

    act(() => hook.result.current.start());

    expect(applyLayout).toHaveBeenCalledOnce();
    expect(applyLayout).toHaveBeenCalledWith(finalLayout);
    expect(hook.result.current.isRunning).toBe(false);
    hook.unmount();
  });

  it("MSI-07 and MSI-09 persists only the final result and leaves no delayed layout write", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const input = sortableInput(true);
    const finalLayout = planMagicSort({ ...input, ...measuredGeometry() }).steps.at(-1)!;
    const persistedLayouts: MagicSortLayout[] = [];
    const hook = renderHook(
      ({ currentInput }) => useMagicSort({
        input: currentInput,
        contextKey: "active-set",
        captureGeometry: measuredGeometry,
        applyLayout: (layout) => persistedLayouts.push(layout)
      }),
      { initialProps: { currentInput: input } }
    );

    act(() => hook.result.current.start());
    expect(persistedLayouts).toEqual([finalLayout]);

    hook.rerender({ currentInput: { ...input, workItemIds: [202, 201, 203] } });
    act(() => vi.runAllTimers());
    expect(persistedLayouts).toEqual([finalLayout]);
    hook.unmount();
  });

  it("MSI-08 confirms a click without writing when the layout is already final", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const input = alreadySortedInput();
    expect(planMagicSort(input).steps).toHaveLength(1);
    const applyLayout = vi.fn();
    const hook = renderHook(() => useMagicSort({ input, applyLayout }));

    act(() => hook.result.current.start());

    expect(applyLayout).not.toHaveBeenCalled();
    expect(hook.result.current.feedbackState).toBe("confirmed");
    expect(hook.result.current.status).toMatch(/completed|abgeschlossen|fertig/i);
    hook.unmount();
  });
});

function InstantActionHarness(props: { input: MagicSortInput }): React.ReactElement {
  const magicSort = useMagicSort({ input: props.input, captureGeometry: measuredGeometry, applyLayout: () => undefined });
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

function sortableInput(addSpacer: boolean): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [103, 102, 101] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 },
      { kind: "test-case", suiteId: 11, testCaseId: 103 }
    ],
    workItemIds: [201, 202, 203],
    workItemPositions: addSpacer ? { 201: 4, 202: 2, 203: 0 } : undefined,
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [102] },
      { id: 203, relatedTestCaseIds: [103] }
    ],
    addSpacer
  };
}

function alreadySortedInput(): MagicSortInput {
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

function measuredGeometry() {
  return {
    measuredTestCaseSlotCenters: [50, 100, 150],
    measuredWorkItemSlotCenters: [50, 100, 150, 200, 250]
  };
}
