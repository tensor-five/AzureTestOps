import { describe, expect, it, vi } from "vitest";

import { buildDraggableCardSurface } from "./draggable-card.js";
import type { ItemPositioningApi, ItemPosition } from "./use-item-positioning.js";

function makePositioning(overrides: Partial<ItemPositioningApi> = {}): ItemPositioningApi {
  return {
    positions: {} as Readonly<Record<string, ItemPosition>>,
    getOffset: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    isDragging: vi.fn().mockReturnValue(false),
    startDrag: vi.fn(),
    resetItem: vi.fn(),
    enabled: false,
    ...overrides
  };
}

describe("buildDraggableCardSurface", () => {
  it("merges base class names with the move-mode draggable modifier when positioning is enabled", () => {
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: true }),
      "wi:1",
      ["relations-view-card", "relations-view-card-test"]
    );
    expect(surface.className.split(" ")).toEqual([
      "relations-view-card",
      "relations-view-card-test",
      "relations-view-card-draggable"
    ]);
  });

  it("emits the line-source modifier in edit-mode only when an editPointerDown handler is provided", () => {
    const editPointerDown = vi.fn();
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: false }),
      "wi:1",
      ["relations-view-card"],
      { editPointerDown }
    );
    expect(surface.className).toContain("relations-view-card-line-source");
  });

  it("does not add the line-source modifier when neither move nor edit handlers apply", () => {
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: false }),
      "wi:1",
      ["relations-view-card"]
    );
    expect(surface.className).toBe("relations-view-card");
  });

  it("appends the dragging modifier while the item is actively dragged", () => {
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: true, isDragging: vi.fn().mockReturnValue(true) }),
      "wi:1",
      []
    );
    expect(surface.className.split(" ")).toContain("relations-view-card-dragging");
  });

  it("returns no transform style when the offset is zero", () => {
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: true }),
      "wi:1",
      []
    );
    expect(surface.style).toEqual({});
  });

  it("emits a translate3d transform when the offset is non-zero", () => {
    const surface = buildDraggableCardSurface(
      makePositioning({
        enabled: true,
        getOffset: vi.fn().mockReturnValue({ x: 40, y: 20 })
      }),
      "wi:1",
      []
    );
    expect(surface.style).toEqual({ transform: "translate3d(40px, 20px, 0)" });
  });

  it("routes pointerdown to startDrag in move-mode and ignores editPointerDown", () => {
    const startDrag = vi.fn();
    const editPointerDown = vi.fn();
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: true, startDrag }),
      "wi:1",
      [],
      { editPointerDown }
    );
    const event = {} as React.PointerEvent<HTMLElement>;

    surface.onPointerDown(event);

    expect(startDrag).toHaveBeenCalledWith("wi:1", event);
    expect(editPointerDown).not.toHaveBeenCalled();
  });

  it("routes pointerdown to editPointerDown in edit-mode and never calls startDrag", () => {
    const startDrag = vi.fn();
    const editPointerDown = vi.fn();
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: false, startDrag }),
      "wi:1",
      [],
      { editPointerDown }
    );
    const event = {} as React.PointerEvent<HTMLElement>;

    surface.onPointerDown(event);

    expect(editPointerDown).toHaveBeenCalledWith("wi:1", event);
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("ignores pointerdown when neither handler applies (edit-mode without editPointerDown)", () => {
    const startDrag = vi.fn();
    const surface = buildDraggableCardSurface(
      makePositioning({ enabled: false, startDrag }),
      "wi:1",
      []
    );
    surface.onPointerDown({} as React.PointerEvent<HTMLElement>);
    expect(startDrag).not.toHaveBeenCalled();
  });
});
