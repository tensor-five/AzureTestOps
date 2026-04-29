// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useActiveSetSnapshot } from "./use-active-set-snapshot.js";

type EventHandler = (event: MessageEvent | Event) => void;

class StubEventSource {
  public static lastInstance: StubEventSource | null = null;

  public readonly url: string;
  public closed = false;
  public onerror: ((event: Event) => void) | null = null;
  private readonly handlers = new Map<string, EventHandler[]>();

  public constructor(url: string) {
    this.url = url;
    StubEventSource.lastInstance = this;
  }

  public addEventListener(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  public dispatch(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event) ?? [];
    const messageEvent = new MessageEvent(event, { data: JSON.stringify(payload) });
    for (const handler of handlers) {
      handler(messageEvent);
    }
  }

  public dispatchTransportError(): void {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  public close(): void {
    this.closed = true;
  }
}

function setupHookHarness<T>(useHook: () => T): { result: { current: T }; unmount(): void } {
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

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useActiveSetSnapshot", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", StubEventSource as unknown as typeof EventSource);
    StubEventSource.lastInstance = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an EventSource for the active set and tracks loading state", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"));
    await flushAsync();

    expect(StubEventSource.lastInstance?.url).toBe(
      "/phase2/active-set/snapshot/stream?setId=set-1"
    );
    expect(harness.result.current.state.isLoading).toBe(true);

    harness.unmount();
  });

  it("forwards progress events into state and resolves on result", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"));
    await flushAsync();

    const source = StubEventSource.lastInstance!;
    act(() => {
      source.dispatch("progress", { stage: "test-cases", done: 0, total: 1 });
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
      source.dispatch("result", { snapshot });
    });

    expect(harness.result.current.state.snapshot).toEqual(snapshot);
    expect(harness.result.current.state.isLoading).toBe(false);
    expect(source.closed).toBe(true);

    harness.unmount();
  });

  it("captures error events with the server-supplied message", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"));
    await flushAsync();

    const source = StubEventSource.lastInstance!;
    act(() => {
      source.dispatch("error", { code: "SET_NOT_FOUND", message: "Set ghost not found." });
    });

    expect(harness.result.current.state.error).toContain("Set ghost not found.");
    expect(harness.result.current.state.isLoading).toBe(false);
    expect(source.closed).toBe(true);

    harness.unmount();
  });

  it("resets state when called with a null setId", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot(null));
    await flushAsync();

    expect(StubEventSource.lastInstance).toBeNull();
    expect(harness.result.current.state).toEqual({
      snapshot: null,
      progress: null,
      isLoading: false,
      error: null
    });

    harness.unmount();
  });

  it("treats a transport error as a failed snapshot when no result has arrived", async () => {
    const harness = setupHookHarness(() => useActiveSetSnapshot("set-1"));
    await flushAsync();

    act(() => {
      StubEventSource.lastInstance!.dispatchTransportError();
    });

    expect(harness.result.current.state.isLoading).toBe(false);
    expect(harness.result.current.state.error).toBeTruthy();

    harness.unmount();
  });
});
