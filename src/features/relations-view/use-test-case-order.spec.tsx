// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useTestCaseOrder } from "./use-test-case-order.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";

function setupHookHarness<T>(useHook: () => T): {
  result: { current: T };
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: undefined as unknown as T };

  function Capture(): React.ReactElement | null {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(<Capture />);
  });

  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("useTestCaseOrder", () => {
  let persistSpy: ReturnType<typeof vi.spyOn>;
  let cacheSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearSetLayoutPreferenceForTests();
    persistSpy = vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
    cacheSpy = vi
      .spyOn(preferencesClient, "getCachedUserPreferences")
      .mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds from cached preferences and applies stored order per suite", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": { testCaseOrder: { "3": [202, 201], "4": [301] } }
      }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    const suite3 = harness.result.current.sortByStoredOrder(3, [
      { workItemId: 201 },
      { workItemId: 202 }
    ]);
    expect(suite3.map((p) => p.workItemId)).toEqual([202, 201]);

    const suite4 = harness.result.current.sortByStoredOrder(4, [
      { workItemId: 301 },
      { workItemId: 302 }
    ]);
    // Unknown id 302 stays at the tail in the order it arrived in.
    expect(suite4.map((p) => p.workItemId)).toEqual([301, 302]);

    harness.unmount();
  });

  it("returns the input untouched when nothing is persisted for the suite", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { testCaseOrder: { "3": [202] } } }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    const sorted = harness.result.current.sortByStoredOrder(99, [
      { workItemId: 700 },
      { workItemId: 701 }
    ]);
    expect(sorted.map((p) => p.workItemId)).toEqual([700, 701]);

    harness.unmount();
  });

  it("moves an item before another and persists the new order under suite key", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": { testCaseOrder: { "3": [201, 202, 203] } }
      }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    act(() => {
      harness.result.current.move(3, 203, 201, "before");
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": { testCaseOrder: { "3": [203, 201, 202] } }
      }
    });

    harness.unmount();
  });

  it("moves an item after another and persists the new order", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": { testCaseOrder: { "3": [201, 202, 203] } }
      }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    act(() => {
      harness.result.current.move(3, 201, 203, "after");
    });

    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: {
        "set-1": { testCaseOrder: { "3": [202, 203, 201] } }
      }
    });

    harness.unmount();
  });

  it("preserves order in other suites and existing collapsedSuites on persist", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["10"],
          testCaseOrder: { "3": [201, 202], "4": [301] }
        }
      }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    act(() => {
      harness.result.current.move(3, 202, 201, "before");
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["10"],
          testCaseOrder: { "3": [202, 201], "4": [301] }
        }
      }
    });

    harness.unmount();
  });

  it("seeds previously-untracked suite ids when dragging onto them", () => {
    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    act(() => {
      harness.result.current.move(7, 401, 402, "before");
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { testCaseOrder: { "7": [401, 402] } } }
    });

    harness.unmount();
  });

  it("ignores no-op moves where source and target are equal", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { testCaseOrder: { "3": [201] } } }
    });

    const harness = setupHookHarness(() => useTestCaseOrder("set-1"));

    act(() => {
      harness.result.current.move(3, 201, 201, "before");
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("does not persist when no set is active", () => {
    const harness = setupHookHarness(() => useTestCaseOrder(null));

    act(() => {
      harness.result.current.move(3, 201, 202, "after");
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });
});
