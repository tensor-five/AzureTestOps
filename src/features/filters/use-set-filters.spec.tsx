// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useSetFilters } from "./use-set-filters.js";
import { clearSetFilterPreferenceForTests } from "./set-filter-preference-store.js";
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

describe("useSetFilters", () => {
  let persistSpy: ReturnType<typeof vi.spyOn>;
  let cacheSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearSetFilterPreferenceForTests();
    persistSpy = vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
    cacheSpy = vi
      .spyOn(preferencesClient, "getCachedUserPreferences")
      .mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds the per-column filter state from cached preferences", () => {
    cacheSpy.mockReturnValue({
      setFilters: {
        "set-1": {
          testCases: { lastOutcomes: ["Failed"], titleQuery: "auth" },
          workItems: { tags: ["regression"] }
        }
      }
    });

    const harness = setupHookHarness(() => useSetFilters("set-1"));

    expect(harness.result.current.testCaseFilter).toEqual({
      lastOutcomes: ["Failed"],
      titleQuery: "auth"
    });
    expect(harness.result.current.workItemFilter).toEqual({ tags: ["regression"] });

    harness.unmount();
  });

  it("persists updates under setFilters[setId] split per column", () => {
    const harness = setupHookHarness(() => useSetFilters("set-1"));

    act(() => {
      harness.result.current.setTestCaseFilter({ lastOutcomes: ["Failed"] });
    });

    expect(persistSpy).toHaveBeenLastCalledWith({
      setFilters: { "set-1": { testCases: { lastOutcomes: ["Failed"] } } }
    });

    act(() => {
      harness.result.current.setWorkItemFilter({ states: ["New"] });
    });

    expect(persistSpy).toHaveBeenLastCalledWith({
      setFilters: {
        "set-1": {
          testCases: { lastOutcomes: ["Failed"] },
          workItems: { states: ["New"] }
        }
      }
    });

    harness.unmount();
  });

  it("strips a column entry when its filter becomes empty", () => {
    cacheSpy.mockReturnValue({
      setFilters: {
        "set-1": {
          testCases: { lastOutcomes: ["Failed"] },
          workItems: { states: ["New"] }
        }
      }
    });

    const harness = setupHookHarness(() => useSetFilters("set-1"));

    act(() => {
      harness.result.current.clearTestCaseFilter();
    });

    expect(persistSpy).toHaveBeenLastCalledWith({
      setFilters: { "set-1": { workItems: { states: ["New"] } } }
    });
    expect(harness.result.current.testCaseFilter).toEqual({});

    harness.unmount();
  });

  it("emits a single-set deletion patch when the last column of a set is cleared", () => {
    cacheSpy.mockReturnValue({
      setFilters: {
        "set-1": { testCases: { lastOutcomes: ["Failed"] } }
      }
    });

    const harness = setupHookHarness(() => useSetFilters("set-1"));

    act(() => {
      harness.result.current.clearTestCaseFilter();
    });

    // An empty per-set entry signals "delete this entry" to the lowdb adapter,
    // which applies a per-setId merge instead of replacing the whole map.
    expect(persistSpy).toHaveBeenLastCalledWith({ setFilters: { "set-1": {} } });

    harness.unmount();
  });

  it("does not touch sibling sets when one set is fully cleared", () => {
    cacheSpy.mockReturnValue({
      setFilters: {
        "set-1": { testCases: { lastOutcomes: ["Failed"] } },
        "set-2": { workItems: { states: ["New"] } }
      }
    });

    const harness = setupHookHarness(() => useSetFilters("set-1"));

    act(() => {
      harness.result.current.clearTestCaseFilter();
    });

    // Patch only references set-1; the server preserves set-2 because it is
    // absent from the keyed scope of the patch.
    expect(persistSpy).toHaveBeenLastCalledWith({
      setFilters: { "set-1": {} }
    });

    harness.unmount();
  });

  it("does not persist when no set is active", () => {
    const harness = setupHookHarness(() => useSetFilters(null));

    act(() => {
      harness.result.current.setTestCaseFilter({ titleQuery: "anything" });
    });

    expect(persistSpy).not.toHaveBeenCalled();

    harness.unmount();
  });
});
