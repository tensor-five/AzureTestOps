// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useLineDrawing, type LineDrawingApi } from "./use-line-drawing.js";

type Harness = {
  result: { current: LineDrawingApi };
  container: HTMLElement;
  unmount(): void;
};

function renderHook(
  enabled: boolean,
  onConnect: (a: string, b: string) => void
): Harness {
  const wrapper = document.createElement("div");
  document.body.appendChild(wrapper);
  const root = createRoot(wrapper);
  const result = { current: undefined as unknown as LineDrawingApi };
  const containerRef = React.createRef<HTMLDivElement>();

  function Capture(): React.ReactElement {
    result.current = useLineDrawing({
      containerRef: containerRef as React.RefObject<HTMLElement | null>,
      enabled,
      onConnect
    });
    return <div ref={containerRef} className="container" />;
  }

  act(() => {
    root.render(<Capture />);
  });

  return {
    result,
    container: containerRef.current as HTMLDivElement,
    unmount() {
      act(() => {
        root.unmount();
      });
      wrapper.remove();
    }
  };
}

function makeCard(itemKey: string, anchor: "left" | "right"): HTMLElement {
  const el = document.createElement("article");
  el.dataset.itemKey = itemKey;
  el.dataset.relationsAnchor = anchor;
  document.body.appendChild(el);
  return el;
}

describe("useLineDrawing", () => {
  beforeEach(() => {
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = function () {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = function () {};
    }
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = function () {
        return true;
      };
    }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      }
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("starts as a no-op when disabled", () => {
    const onConnect = vi.fn();
    const harness = renderHook(false, onConnect);

    const synthetic = makeSyntheticPointer({
      currentTarget: harness.container,
      clientX: 10,
      clientY: 10
    });

    act(() => {
      harness.result.current.startFromCard("tc:1:1", synthetic);
    });

    expect(harness.result.current.draft).toBeNull();
    harness.unmount();
  });

  it("opens a draft line on pointer-down and clears it on pointer-up", () => {
    const onConnect = vi.fn();
    const harness = renderHook(true, onConnect);

    const sourceCard = makeCard("tc:1:1", "left");
    const targetCard = makeCard("wi:99", "right");

    const synthetic = makeSyntheticPointer({
      currentTarget: sourceCard,
      clientX: 50,
      clientY: 30
    });

    act(() => {
      harness.result.current.startFromCard("tc:1:1", synthetic);
    });

    expect(harness.result.current.draft).not.toBeNull();
    expect(harness.result.current.draft?.sourceItemKey).toBe("tc:1:1");

    stubElementFromPoint(targetCard);

    act(() => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientX: 80, clientY: 30 }));
    });

    expect(harness.result.current.draft).toBeNull();
    expect(onConnect).toHaveBeenCalledWith("tc:1:1", "wi:99");

    harness.unmount();
  });

  it("does not invoke onConnect when pointer-up lands on the source card", () => {
    const onConnect = vi.fn();
    const harness = renderHook(true, onConnect);

    const sourceCard = makeCard("tc:1:1", "left");

    const synthetic = makeSyntheticPointer({
      currentTarget: sourceCard,
      clientX: 50,
      clientY: 30
    });

    act(() => {
      harness.result.current.startFromCard("tc:1:1", synthetic);
    });

    stubElementFromPoint(sourceCard);

    act(() => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientX: 50, clientY: 30 }));
    });

    expect(onConnect).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("dismisses the draft on pointercancel without invoking onConnect", () => {
    const onConnect = vi.fn();
    const harness = renderHook(true, onConnect);

    const sourceCard = makeCard("tc:1:1", "left");
    const synthetic = makeSyntheticPointer({
      currentTarget: sourceCard,
      clientX: 0,
      clientY: 0
    });

    act(() => {
      harness.result.current.startFromCard("tc:1:1", synthetic);
    });

    act(() => {
      window.dispatchEvent(makePointerEvent("pointercancel", { clientX: 0, clientY: 0 }));
    });

    expect(harness.result.current.draft).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
    harness.unmount();
  });
});

function stubElementFromPoint(target: Element | null): void {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => target
  });
}

function makeSyntheticPointer(args: {
  currentTarget: HTMLElement;
  clientX: number;
  clientY: number;
  pointerId?: number;
}): React.PointerEvent<HTMLElement> {
  return {
    button: 0,
    pointerId: args.pointerId ?? 1,
    clientX: args.clientX,
    clientY: args.clientY,
    currentTarget: args.currentTarget,
    target: args.currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as React.PointerEvent<HTMLElement>;
}

function makePointerEvent(type: string, init: { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
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
