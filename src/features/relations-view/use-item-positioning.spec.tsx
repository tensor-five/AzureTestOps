// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import {
  POSITION_GRID_PX,
  snapToGrid,
  useItemPositioning
} from "./use-item-positioning.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";

beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function setPointerCapture(): void {
      // jsdom stub
    };
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(): void {
      // jsdom stub
    };
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
      return true;
    };
  }
});

function renderHookWithTarget<T>(useHook: () => T): {
  result: { current: T };
  target: HTMLElement;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const result = { current: undefined as unknown as T };
  const targetRef = React.createRef<HTMLElement>();

  function Capture(): React.ReactElement {
    result.current = useHook();
    return <div ref={targetRef as React.Ref<HTMLDivElement>} />;
  }

  act(() => {
    root.render(<Capture />);
  });

  if (!targetRef.current) {
    throw new Error("Expected target element to be mounted.");
  }

  return {
    result,
    target: targetRef.current,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

function makePointerEvent(type: string, init: { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
  // PointerEvent is supported in jsdom 28+; if missing, we fall back to MouseEvent shape
  // and the hook still reads clientX/clientY/pointerId via the event interface.
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: init.pointerId ?? 1,
      clientX: init.clientX,
      clientY: init.clientY,
      button: 0
    });
  }
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: 0
  }) as MouseEvent & { pointerId: number };
  event.pointerId = init.pointerId ?? 1;
  return event as unknown as PointerEvent;
}

describe("useItemPositioning", () => {
  let persistSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    persistSpy = vi
      .spyOn(preferencesClient, "persistUserPreferencesPatch")
      .mockReturnValue();
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("snapToGrid rounds to the configured grid", () => {
    expect(snapToGrid(13)).toBe(POSITION_GRID_PX);
    expect(snapToGrid(-13)).toBe(-POSITION_GRID_PX);
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(45)).toBe(40);
  });

  it("returns the zero offset for items without a saved position", () => {
    const harness = renderHookWithTarget(() => useItemPositioning("set-1", true));

    expect(harness.result.current.getOffset("missing")).toEqual({ x: 0, y: 0 });

    harness.unmount();
  });

  it("ignores startDrag when the hook is disabled", () => {
    const harness = renderHookWithTarget(() => useItemPositioning("set-1", false));

    const synthetic = {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      currentTarget: harness.target,
      preventDefault: vi.fn(),
      // setPointerCapture is read off currentTarget, not the event itself
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      harness.result.current.startDrag("wi:1", synthetic);
    });

    expect(harness.result.current.isDragging("wi:1")).toBe(false);

    harness.unmount();
  });

  it("snaps an in-flight drag and persists once on pointerup", () => {
    const harness = renderHookWithTarget(() => useItemPositioning("set-1", true));

    const synthetic = {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: harness.target,
      preventDefault: () => {},
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      harness.result.current.startDrag("wi:1", synthetic);
    });
    expect(harness.result.current.isDragging("wi:1")).toBe(true);

    act(() => {
      harness.target.dispatchEvent(makePointerEvent("pointermove", { clientX: 113, clientY: 137 }));
    });

    expect(harness.result.current.getOffset("wi:1")).toEqual({ x: 20, y: 40 });

    act(() => {
      harness.target.dispatchEvent(makePointerEvent("pointerup", { clientX: 113, clientY: 137 }));
    });

    expect(harness.result.current.isDragging("wi:1")).toBe(false);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: { "set-1": { positions: { "wi:1": { x: 20, y: 40 } } } }
    });

    harness.unmount();
  });

  it("preserves existing collapsedSuites when persisting positions", () => {
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["7"],
          positions: { "wi:1": { x: 20, y: 0 } }
        }
      }
    });

    const harness = renderHookWithTarget(() => useItemPositioning("set-1", true));

    const synthetic = {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      currentTarget: harness.target,
      preventDefault: () => {},
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      harness.result.current.startDrag("wi:1", synthetic);
    });
    act(() => {
      harness.target.dispatchEvent(makePointerEvent("pointermove", { clientX: 25, clientY: 0 }));
    });
    act(() => {
      harness.target.dispatchEvent(makePointerEvent("pointerup", { clientX: 25, clientY: 0 }));
    });

    expect(persistSpy).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": {
          collapsedSuites: ["7"],
          positions: { "wi:1": { x: 40, y: 0 } }
        }
      }
    });

    harness.unmount();
  });

  it("resetItem drops the offset and persists the change", () => {
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({
      setLayouts: { "set-1": { positions: { "wi:1": { x: 40, y: 60 } } } }
    });

    const harness = renderHookWithTarget(() => useItemPositioning("set-1", true));

    expect(harness.result.current.getOffset("wi:1")).toEqual({ x: 40, y: 60 });

    act(() => {
      harness.result.current.resetItem("wi:1");
    });

    expect(harness.result.current.getOffset("wi:1")).toEqual({ x: 0, y: 0 });
    expect(persistSpy).toHaveBeenLastCalledWith({
      setLayouts: { "set-1": { positions: {} } }
    });

    harness.unmount();
  });
});
