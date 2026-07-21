// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useWorkItemOrder } from "./use-work-item-order.js";
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

describe("useWorkItemOrder", () => {
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

  it("seeds from cached preferences and applies the stored order", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { workItemOrder: [503, 501, 502] } }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    const sorted = harness.result.current.sortByStoredOrder([
      { id: 501 },
      { id: 502 },
      { id: 503 }
    ]);
    expect(sorted.map((item) => item.id)).toEqual([503, 501, 502]);

    harness.unmount();
  });

  it("appends unknown ids after stored ones, preserving caller order at the tail", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { workItemOrder: [503, 501] } }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    const sorted = harness.result.current.sortByStoredOrder([
      { id: 501 },
      { id: 502 },
      { id: 503 },
      { id: 504 }
    ]);
    expect(sorted.map((item) => item.id)).toEqual([503, 501, 502, 504]);

    harness.unmount();
  });

  it("falls back to caller order when nothing is persisted yet", () => {
    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    const sorted = harness.result.current.sortByStoredOrder([
      { id: 502 },
      { id: 501 }
    ]);
    expect(sorted.map((item) => item.id)).toEqual([502, 501]);

    harness.unmount();
  });

  it("moves an item before another and persists the new order", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { workItemOrder: [501, 502, 503] } }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));
    const revisionBeforeMove = harness.result.current.layoutRevision;

    act(() => {
      harness.result.current.move(503, 501, "before", [501, 502, 503]);
    });

    expect(harness.result.current.layoutRevision).toBeGreaterThan(revisionBeforeMove);

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { workItemOrder: [503, 501, 502] } }
    });

    const sorted = harness.result.current.sortByStoredOrder([
      { id: 501 },
      { id: 502 },
      { id: 503 }
    ]);
    expect(sorted.map((item) => item.id)).toEqual([503, 501, 502]);

    harness.unmount();
  });

  it("moves an item after another and persists the new order", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { workItemOrder: [501, 502, 503] } }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(501, 503, "after", [501, 502, 503]);
    });

    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: { "set-1": { workItemOrder: [502, 503, 501] } }
    });

    harness.unmount();
  });

  it("preserves existing collapsedSuites when persisting reorder changes", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["10"],
          workItemOrder: [501, 502]
        }
      }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(502, 501, "before", [501, 502]);
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["10"],
          workItemOrder: [502, 501]
        }
      }
    });

    harness.unmount();
  });

  it("seeds previously-untracked ids when dragging onto them", () => {
    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(503, 501, "before", [501, 502, 503]);
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { workItemOrder: [503, 501, 502] } }
    });

    harness.unmount();
  });

  it("ignores no-op moves where source and target are equal", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { workItemOrder: [501, 502] } }
    });

    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(501, 501, "before", [501, 502]);
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("does not persist when no set is active", () => {
    const harness = setupHookHarness(() => useWorkItemOrder(null));

    act(() => {
      harness.result.current.move(1, 2, "after", [1, 2]);
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("persists the complete natural sequence for a long jump from position 2 to 8", () => {
    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(2, 8, "after", [1, 2, 3, 4, 5, 6, 7, 8]);
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { workItemOrder: [1, 3, 4, 5, 6, 7, 8, 2] } }
    });

    harness.unmount();
  });

  it("persists a long jump from position 2 exactly before position 8", () => {
    const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

    act(() => {
      harness.result.current.move(2, 8, "before", [1, 2, 3, 4, 5, 6, 7, 8]);
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { workItemOrder: [1, 3, 4, 5, 6, 7, 2, 8] } }
    });

    harness.unmount();
  });

  it.each([
    ["before", [1, 8, 2, 3, 4, 5, 6, 7]],
    ["after", [1, 2, 8, 3, 4, 5, 6, 7]]
  ] as const)(
    "persists a long backwards move from position 8 to position 2 using the %s edge",
    (edge, expected) => {
      const harness = setupHookHarness(() => useWorkItemOrder("set-1"));

      act(() => {
        harness.result.current.move(8, 2, edge, [1, 2, 3, 4, 5, 6, 7, 8]);
      });

      expect(persistSpy).toHaveBeenCalledWith({
        setLayouts: { "set-1": { workItemOrder: expected } }
      });

      harness.unmount();
    }
  );
});
