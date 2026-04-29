import type * as React from "react";

import type { ItemPosition, ItemPositioningApi } from "./use-item-positioning.js";

export type DraggableCardSurface = {
  className: string;
  style: React.CSSProperties;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
};

/**
 * Bundles the drag-related class modifiers, transform style and pointer-down
 * handler that every card in the RelationsView shares. Card components keep
 * domain-specific class names (outcome, work-item type) local; only the
 * drag/positioning concerns live here.
 */
export function buildDraggableCardSurface(
  positioning: ItemPositioningApi,
  itemKey: string,
  baseClassNames: readonly string[]
): DraggableCardSurface {
  const offset = positioning.getOffset(itemKey);
  const dragging = positioning.isDragging(itemKey);

  const classNames = [...baseClassNames];
  if (positioning.enabled) {
    classNames.push("relations-view-card-draggable");
  }
  if (dragging) {
    classNames.push("relations-view-card-dragging");
  }

  return {
    className: classNames.join(" "),
    style: cardTransformStyle(offset),
    onPointerDown: (event) => positioning.startDrag(itemKey, event)
  };
}

function cardTransformStyle(offset: ItemPosition): React.CSSProperties {
  if (offset.x === 0 && offset.y === 0) {
    return {};
  }
  return { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` };
}
