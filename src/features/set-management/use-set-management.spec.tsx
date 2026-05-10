// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useSetManagement } from "./use-set-management.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";
import type { SetManagementClientPort } from "../../application/ports/client/set-management-client.port.js";

import type { Set } from "../../domain/sets/set.js";

function setupHookHarness<T>(
  useHook: () => T,
  ports: ClientPorts
): { result: { current: T }; unmount(): void; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const result = { current: undefined as unknown as T };

  function Capture(): React.ReactElement | null {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(
      <WithClientPorts ports={ports}>
        <Capture />
      </WithClientPorts>
    );
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
  const sample: Set = {
    id: "abc",
    name: "Sprint 24",
    planId: "9",
    rootSuiteId: "1",
    queryId: "Q-A"
  };

  let setManagement: SetManagementClientPort;
  let listSpy: ReturnType<typeof vi.fn>;
  let createSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;
  let deleteSpy: ReturnType<typeof vi.fn>;
  let setActiveSpy: ReturnType<typeof vi.fn>;
  let ports: ClientPorts;

  beforeEach(() => {
    listSpy = vi.fn(async () => ({ sets: [sample], activeSetId: null as string | null }));
    createSpy = vi.fn(async () => ({ ...sample, id: "new", name: "New" }));
    updateSpy = vi.fn(async () => ({ ...sample, name: "Renamed" }));
    deleteSpy = vi.fn(async () => undefined);
    setActiveSpy = vi.fn(async () => undefined);
    setManagement = {
      list: listSpy as unknown as SetManagementClientPort["list"],
      create: createSpy as unknown as SetManagementClientPort["create"],
      update: updateSpy as unknown as SetManagementClientPort["update"],
      delete: deleteSpy as unknown as SetManagementClientPort["delete"],
      setActive: setActiveSpy as unknown as SetManagementClientPort["setActive"]
    };
    ports = buildClientPortsStub({ setManagement });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads sets on mount via the client port", async () => {
    const harness = setupHookHarness(() => useSetManagement(), ports);
    await flushAsync();

    expect(listSpy).toHaveBeenCalled();
    expect(harness.result.current.sets).toEqual([sample]);
    expect(harness.result.current.isLoading).toBe(false);

    harness.unmount();
  });

  it("optimistically merges created sets into local state", async () => {
    const harness = setupHookHarness(() => useSetManagement(), ports);
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

    expect(createSpy).toHaveBeenCalled();
    expect(harness.result.current.sets.map((entry) => entry.id)).toEqual(["abc", "new"]);
    expect(harness.result.current.activeSetId).toBe("new");

    harness.unmount();
  });

  it("removes sets and clears the active pointer when deleting the active set", async () => {
    listSpy.mockResolvedValueOnce({ sets: [sample], activeSetId: "abc" });
    const harness = setupHookHarness(() => useSetManagement(), ports);
    await flushAsync();

    await act(async () => {
      await harness.result.current.remove("abc");
    });

    expect(deleteSpy).toHaveBeenCalledWith("abc");
    expect(harness.result.current.sets).toHaveLength(0);
    expect(harness.result.current.activeSetId).toBeNull();

    harness.unmount();
  });

  it("updates a set in place via the client port", async () => {
    const harness = setupHookHarness(() => useSetManagement(), ports);
    await flushAsync();

    await act(async () => {
      await harness.result.current.update("abc", { name: "Renamed" });
    });

    expect(updateSpy).toHaveBeenCalledWith("abc", { name: "Renamed" });
    expect(harness.result.current.sets[0].name).toBe("Renamed");

    harness.unmount();
  });

  it("flips the active pointer through setActive()", async () => {
    const harness = setupHookHarness(() => useSetManagement(), ports);
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
