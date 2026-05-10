// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SseActiveSetSnapshotAdapter } from "./sse-active-set-snapshot.adapter.js";
import type { ActiveSetSnapshotStreamEvent } from "../../application/ports/client/active-set-snapshot-client.port.js";

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

describe("SseActiveSetSnapshotAdapter", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", StubEventSource as unknown as typeof EventSource);
    StubEventSource.lastInstance = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an EventSource for the given setId", () => {
    new SseActiveSetSnapshotAdapter().subscribe("set-1", () => undefined);

    expect(StubEventSource.lastInstance?.url).toBe(
      "/phase2/active-set/snapshot/stream?setId=set-1"
    );
  });

  it("forwards progress and result events as typed envelopes and closes on result", () => {
    const events: ActiveSetSnapshotStreamEvent[] = [];
    new SseActiveSetSnapshotAdapter().subscribe("set-1", (event) => events.push(event));

    const source = StubEventSource.lastInstance!;
    source.dispatch("progress", { stage: "test-cases", done: 0, total: 1 });

    const snapshot = {
      set: { id: "set-1", name: "S", planId: "1", rootSuiteId: "1", queryId: "q" },
      suiteTree: { id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] },
      projections: [],
      workItemsFromQuery: [],
      loadedAt: "2026-04-29T12:00:00.000Z"
    };
    source.dispatch("result", { snapshot });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "progress",
      progress: { stage: "test-cases", done: 0, total: 1 }
    });
    expect(events[1]).toEqual({ type: "result", snapshot });
    expect(source.closed).toBe(true);
  });

  it("forwards named error events with the server-supplied message", () => {
    const events: ActiveSetSnapshotStreamEvent[] = [];
    new SseActiveSetSnapshotAdapter().subscribe("set-1", (event) => events.push(event));

    StubEventSource.lastInstance!.dispatch("error", {
      code: "SET_NOT_FOUND",
      message: "Set ghost not found."
    });

    expect(events.find((event) => event.type === "error")).toEqual({
      type: "error",
      message: "Set ghost not found."
    });
  });

  it("translates a transport-level error into a generic error event", () => {
    const events: ActiveSetSnapshotStreamEvent[] = [];
    new SseActiveSetSnapshotAdapter().subscribe("set-1", (event) => events.push(event));

    StubEventSource.lastInstance!.dispatchTransportError();

    expect(events.some((event) => event.type === "error")).toBe(true);
    expect(StubEventSource.lastInstance?.closed).toBe(true);
  });

  it("emits a single error and short-circuits when EventSource is unavailable", () => {
    vi.stubGlobal("EventSource", undefined as unknown as typeof EventSource);

    const events: ActiveSetSnapshotStreamEvent[] = [];
    const subscription = new SseActiveSetSnapshotAdapter().subscribe("set-1", (event) =>
      events.push(event)
    );

    expect(events).toEqual([
      { type: "error", message: "SSE not supported in this environment." }
    ]);
    // close should be a no-op rather than blow up.
    subscription.close();
  });
});
