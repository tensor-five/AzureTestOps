// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useSuiteCollapse } from "./use-suite-collapse.js";
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

describe("useSuiteCollapse", () => {
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

  it("seeds from cached preferences for the given set", () => {
    cacheSpy.mockReturnValue({
      setLayouts: { "set-1": { collapsedSuites: ["10", "12"] } }
    });

    const harness = setupHookHarness(() => useSuiteCollapse("set-1"));

    expect(harness.result.current.isCollapsed(10)).toBe(true);
    expect(harness.result.current.isCollapsed(12)).toBe(true);
    expect(harness.result.current.isCollapsed(99)).toBe(false);

    harness.unmount();
  });

  it("toggles a suite and persists the new shape under setLayouts[setId]", () => {
    const harness = setupHookHarness(() => useSuiteCollapse("set-1"));

    act(() => {
      harness.result.current.toggle(7);
    });

    expect(harness.result.current.isCollapsed(7)).toBe(true);
    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { collapsedSuites: ["7"] } }
    });

    act(() => {
      harness.result.current.toggle(7);
    });

    expect(harness.result.current.isCollapsed(7)).toBe(false);
    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: { "set-1": {} }
    });

    harness.unmount();
  });

  it("preserves existing positions when persisting collapse changes", () => {
    cacheSpy.mockReturnValue({
      setLayouts: {
        "set-1": {
          positions: { "wi:1": { x: 20, y: 40 } },
          collapsedSuites: []
        }
      }
    });

    const harness = setupHookHarness(() => useSuiteCollapse("set-1"));

    act(() => {
      harness.result.current.toggle(5);
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": {
          positions: { "wi:1": { x: 20, y: 40 } },
          collapsedSuites: ["5"]
        }
      }
    });

    harness.unmount();
  });

  it("does not persist when no set is active", () => {
    const harness = setupHookHarness(() => useSuiteCollapse(null));

    act(() => {
      harness.result.current.toggle(1);
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("collapses a supplied suite set and expands all with one persisted update each", () => {
    const harness = setupHookHarness(() => useSuiteCollapse("set-1"));

    act(() => harness.result.current.collapseAll([7, 8, 8, -1]));
    expect([...harness.result.current.collapsedSuiteIds]).toEqual(["7", "8"]);
    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: { "set-1": { collapsedSuites: ["7", "8"] } }
    });

    act(() => harness.result.current.expandAll());
    expect(harness.result.current.collapsedSuiteIds.size).toBe(0);
    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: { "set-1": {} }
    });

    harness.unmount();
  });

});
