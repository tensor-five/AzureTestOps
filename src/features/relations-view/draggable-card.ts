import type * as React from "react";

import type { ItemPosition, ItemPositioningApi } from "./use-item-positioning.js";

export type DraggableCardSurface = {
  className: string;
  style: React.CSSProperties;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
};

export type DraggableCardSurfaceOptions = {
  /**
   * Pointer-down handler used in Edit-relations mode (positioning disabled).
   * Receives the same `itemKey` baked into the surface so consumers don't
   * have to thread it through props.
   */
  editPointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
};

/**
 * Bundles the drag-related class modifiers, transform style and pointer-down
 * handler that every card in the RelationsView shares. Card components keep
 * domain-specific class names (outcome, work-item type) local; only the
 * drag/positioning concerns live here.
 *
 * The pointer-down handler picks one role per gesture based on
 * `positioning.enabled`: if true, dragging the card snaps its position; if
 * false (Edit-relations mode), the optional `editPointerDown` starts a line.
 * Both modes never run together, so no debouncing is needed.
 */
export function buildDraggableCardSurface(
  positioning: ItemPositioningApi,
  itemKey: string,
  baseClassNames: readonly string[],
  options: DraggableCardSurfaceOptions = {}
): DraggableCardSurface {
  const offset = positioning.getOffset(itemKey);
  const dragging = positioning.isDragging(itemKey);

  const classNames = [...baseClassNames];
  if (positioning.enabled) {
    classNames.push("relations-view-card-draggable");
  } else if (options.editPointerDown) {
    classNames.push("relations-view-card-line-source");
  }
  if (dragging) {
    classNames.push("relations-view-card-dragging");
  }

  return {
    className: classNames.join(" "),
    style: cardTransformStyle(offset),
    onPointerDown: (event) => {
      if (positioning.enabled) {
        positioning.startDrag(itemKey, event);
        return;
      }
      options.editPointerDown?.(itemKey, event);
    }
  };
}

function cardTransformStyle(offset: ItemPosition): React.CSSProperties {
  if (offset.x === 0 && offset.y === 0) {
    return {};
  }
  return { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` };
}
