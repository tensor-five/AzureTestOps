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
    StubEventSource.lastInstance?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens an EventSource for the given setId", () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const subscription = new SseActiveSetSnapshotAdapter().subscribe("set-1", () => undefined);

    const url = new URL(StubEventSource.lastInstance!.url, 'http://local');
    expect(url.pathname).toBe('/phase2/active-set/snapshot/stream');
    expect(url.searchParams.get('setId')).toBe('set-1');
    expect(url.searchParams.get('requestId')).toBe(log.mock.calls[0][1].requestId);
    subscription.close();
    expect(log.mock.calls.at(-1)?.[1].event).toBe('aborted');
  });

  it("forwards progress and result events as typed envelopes and closes on result", () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
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
    expect(log.mock.calls.at(-1)?.[1].event).toBe('complete');
    const count = events.length;
    source.dispatchTransportError();
    expect(events).toHaveLength(count);
  });

  it('forwards cached previews while leaving the stream and diagnostics open for the fresh result', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const events: ActiveSetSnapshotStreamEvent[] = [];
    new SseActiveSetSnapshotAdapter().subscribe('set', event => events.push(event));
    const source = StubEventSource.lastInstance!;
    source.dispatch('cached', { snapshot: { set: { id: 'set' }, suiteTree: { id: 1 }, projections: [], workItemsFromQuery: [],
      loadedAt: '2026-10-15T10:00:00Z', freshness: { sourceReadAt: '2026-10-15T09:59:00Z', cacheUsed: true } } });
    expect(events[0]).toMatchObject({ type: 'cached', snapshot: { freshness: { sourceReadAt: '2026-10-15T09:59:00Z' } } });
    expect(source.closed).toBe(false);
    expect(log.mock.calls.map(call => call[1].event)).toEqual(['start']);
    source.dispatch('progress', { stage: 'test-cases', done: 0, total: 1 });
    source.dispatch('result', { snapshot: { set: { id: 'set' }, suiteTree: { id: 1 }, projections: [], workItemsFromQuery: [], loadedAt: '2026-10-15T10:01:00Z' } });
    expect(events.map(event => event.type)).toEqual(['cached', 'progress', 'result']);
    expect(source.closed).toBe(true);
    expect(log.mock.calls.at(-1)?.[1].event).toBe('complete');
  });

  it('ignores malformed previews without suppressing later progress and errors', () => {
    const events: ActiveSetSnapshotStreamEvent[] = [];
    new SseActiveSetSnapshotAdapter().subscribe('set', event => events.push(event));
    const source = StubEventSource.lastInstance!;
    source.dispatch('cached', { snapshot: null });
    source.dispatch('progress', { stage: 'context', done: 0, total: 1 });
    source.dispatch('error', { message: 'Fresh read failed' });
    expect(events.map(event => event.type)).toEqual(['progress', 'error']);
  });

  it('cleans up diagnosis if EventSource construction fails without logging the exception', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('EventSource', class { constructor() { throw new Error('private-token'); } });
    expect(() => new SseActiveSetSnapshotAdapter().subscribe('set-1', () => {})).toThrow('private-token');
    expect(log.mock.calls.at(-1)?.[1].event).toBe('error');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token');
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
