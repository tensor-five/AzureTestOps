// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useSetManagement } from "./use-set-management.js";
import * as api from "../api/api-client.js";

import type { Set } from "../../domain/sets/set.js";

function setupHookHarness<T>(useHook: () => T): { result: { current: T }; unmount(): void; container: HTMLDivElement } {
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
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("useSetManagement", () => {
  let listSetsSpy: ReturnType<typeof vi.spyOn>;
  let createSetSpy: ReturnType<typeof vi.spyOn>;
  let setActiveSpy: ReturnType<typeof vi.spyOn>;
  let updateSpy: ReturnType<typeof vi.spyOn>;
  let deleteSpy: ReturnType<typeof vi.spyOn>;

  const sample: Set = {
    id: "abc",
    name: "Sprint 24",
    planId: "9",
    rootSuiteId: "1",
    queryId: "Q-A"
  };

  beforeEach(() => {
    listSetsSpy = vi
      .spyOn(api, "listSets")
      .mockResolvedValue({ sets: [sample], activeSetId: null });
    createSetSpy = vi.spyOn(api, "createSetRequest").mockResolvedValue({
      ...sample,
      id: "new",
      name: "New"
    });
    setActiveSpy = vi.spyOn(api, "setActiveSetRequest").mockResolvedValue();
    updateSpy = vi.spyOn(api, "updateSetRequest").mockResolvedValue({
      ...sample,
      name: "Renamed"
    });
    deleteSpy = vi.spyOn(api, "deleteSetRequest").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads sets on mount via the API client", async () => {
    const harness = setupHookHarness(() => useSetManagement());
    await flushAsync();

    expect(listSetsSpy).toHaveBeenCalled();
    expect(harness.result.current.sets).toEqual([sample]);
    expect(harness.result.current.isLoading).toBe(false);

    harness.unmount();
  });

  it("optimistically merges created sets into local state", async () => {
    const harness = setupHookHarness(() => useSetManagement());
    await flushAsync();

    await act(async () => {
      await harness.result.current.create({
        name: "New",
        planId: "10",
        rootSuiteId: "2",
        queryId: "Q-B",
        setActive: true
      });
    });

    expect(createSetSpy).toHaveBeenCalled();
    expect(harness.result.current.sets.map((entry) => entry.id)).toEqual(["abc", "new"]);
    expect(harness.result.current.activeSetId).toBe("new");

    harness.unmount();
  });

  it("removes sets and clears the active pointer when deleting the active set", async () => {
    const harness = setupHookHarness(() => useSetManagement());
    listSetsSpy.mockResolvedValueOnce({ sets: [sample], activeSetId: "abc" });
    await act(async () => {
      await harness.result.current.refresh();
    });

    await act(async () => {
      await harness.result.current.remove("abc");
    });

    expect(deleteSpy).toHaveBeenCalledWith("abc");
    expect(harness.result.current.sets).toHaveLength(0);
    expect(harness.result.current.activeSetId).toBeNull();

    harness.unmount();
  });

  it("updates a set in place via the API", async () => {
    const harness = setupHookHarness(() => useSetManagement());
    await flushAsync();

    await act(async () => {
      await harness.result.current.update("abc", { name: "Renamed" });
    });

    expect(updateSpy).toHaveBeenCalledWith("abc", { name: "Renamed" });
    expect(harness.result.current.sets[0].name).toBe("Renamed");

    harness.unmount();
  });

  it("flips the active pointer through setActive()", async () => {
    const harness = setupHookHarness(() => useSetManagement());
    await flushAsync();

    await act(async () => {
      await harness.result.current.setActive("abc");
    });

    expect(setActiveSpy).toHaveBeenCalledWith("abc");
    expect(harness.result.current.activeSetId).toBe("abc");

    harness.unmount();
  });
});

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
