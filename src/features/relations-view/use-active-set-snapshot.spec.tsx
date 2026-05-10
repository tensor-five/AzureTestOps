// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useActiveSetSnapshot } from "./use-active-set-snapshot.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";
import type {
  ActiveSetSnapshotClientPort,
  ActiveSetSnapshotStreamEvent
} from "../../application/ports/client/active-set-snapshot-client.port.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";

type EmittedSubscription = {
  setId: string;
  emit: (event: ActiveSetSnapshotStreamEvent) => void;
  closed: boolean;
};

function buildSnapshotPort(): {
  port: ActiveSetSnapshotClientPort;
  active: () => EmittedSubscription | null;
} {
  let active: EmittedSubscription | null = null;
  const port: ActiveSetSnapshotClientPort = {
    subscribe(setId, onEvent) {
      const subscription: EmittedSubscription = {
        setId,
        closed: false,
        emit: (event) => onEvent(event)
      };
      active = subscription;
      return {
        close: () => {
          subscription.closed = true;
        }
      };
    }
  };
  return { port, active: () => active };
}

function setupHookHarness<T>(
  useHook: () => T,
  ports: ClientPorts
): { result: { current: T }; unmount(): void } {
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
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useActiveSetSnapshot", () => {
  let snapshotPort: ReturnType<typeof buildSnapshotPort>;
  let ports: ClientPorts;

  beforeEach(() => {
    snapshotPort = buildSnapshotPort();
    ports = buildClientPortsStub({ activeSetSnapshot: snapshotPort.port });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subscribes for the active set and tracks loading state", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"), ports);
    await flushAsync();

    expect(snapshotPort.active()?.setId).toBe("set-1");
    expect(harness.result.current.state.isLoading).toBe(true);

    harness.unmount();
  });

  it("forwards progress events into state and resolves on result", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"), ports);
    await flushAsync();

    const subscription = snapshotPort.active()!;
    act(() => {
      subscription.emit({
        type: "progress",
        progress: { stage: "test-cases", done: 0, total: 1 }
      });
    });
    expect(harness.result.current.state.progress?.stage).toBe("test-cases");

    const snapshot = {
      set: { id: "set-1", name: "S", planId: "1", rootSuiteId: "1", queryId: "q" },
      suiteTree: { id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] },
      projections: [],
      workItemsFromQuery: [],
      loadedAt: "2026-04-29T12:00:00.000Z"
    };
    act(() => {
      subscription.emit({ type: "result", snapshot });
    });

    expect(harness.result.current.state.snapshot).toEqual(snapshot);
    expect(harness.result.current.state.isLoading).toBe(false);
    expect(subscription.closed).toBe(true);

    harness.unmount();
  });

  it("captures error events with the port-supplied message", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"), ports);
    await flushAsync();

    const subscription = snapshotPort.active()!;
    act(() => {
      subscription.emit({ type: "error", message: "Set ghost not found." });
    });

    expect(harness.result.current.state.error).toContain("Set ghost not found.");
    expect(harness.result.current.state.isLoading).toBe(false);
    expect(subscription.closed).toBe(true);

    harness.unmount();
  });

  it("resets state when called with a null setId", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot(null), ports);
    await flushAsync();

    expect(snapshotPort.active()).toBeNull();
    expect(harness.result.current.state).toEqual({
      snapshot: null,
      progress: null,
      isLoading: false,
      error: null
    });

    harness.unmount();
  });

  it("treats an error event as a failed snapshot when no result has arrived", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"), ports);
    await flushAsync();

    act(() => {
      snapshotPort.active()!.emit({ type: "error", message: "Snapshot stream connection lost." });
    });

    expect(harness.result.current.state.isLoading).toBe(false);
    expect(harness.result.current.state.error).toBeTruthy();

    harness.unmount();
  });
});
