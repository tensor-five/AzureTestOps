import * as React from "react";

import {
  getCachedUserPreferences,
  persistUserPreferencesPatch
} from "../../shared/user-preferences/user-preferences.client.js";
import type { SetLayoutPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type ItemPosition = { x: number; y: number };

export type ItemPositioningApi = {
  positions: Readonly<Record<string, ItemPosition>>;
  getOffset(itemKey: string): ItemPosition;
  isDragging(itemKey: string): boolean;
  startDrag(itemKey: string, event: React.PointerEvent<HTMLElement>): void;
  resetItem(itemKey: string): void;
  enabled: boolean;
};

export const POSITION_GRID_PX = 20;

const ZERO_OFFSET: ItemPosition = { x: 0, y: 0 };

/**
 * Pointer-driven snap-to-grid drag for move-mode cards.
 *
 * Positions are stored as additive offsets (`{x, y}`) on top of the card's
 * natural in-flow position; the consumer applies `transform: translate(x, y)`
 * at render time. This keeps the layout deterministic when new items appear
 * and avoids re-flow when an item has no saved offset yet.
 *
 * `setLayouts[setId].positions[itemKey] = { x, y }` is mirrored to lowdb on
 * every drag end (snap rounded to {@link POSITION_GRID_PX}). When `enabled`
 * is false (Edit-relations mode) drag handlers no-op so the same component
 * tree renders both modes without conditional handlers.
 */
export function useItemPositioning(
  setId: string | null,
  enabled: boolean
): ItemPositioningApi {
  const [positions, setPositions] = React.useState<Record<string, ItemPosition>>(() =>
    seedPositionsFromPreferences(setId)
  );
  const [draggingKey, setDraggingKey] = React.useState<string | null>(null);
  const positionsRef = React.useRef(positions);
  positionsRef.current = positions;

  React.useEffect(() => {
    setPositions(seedPositionsFromPreferences(setId));
    setDraggingKey(null);
  }, [setId]);

  const persist = React.useCallback(
    (next: Record<string, ItemPosition>) => {
      if (!setId) {
        return;
      }
      const layoutForSet = readLayoutForSet(setId);
      const merged: SetLayoutPreference = {
        ...layoutForSet,
        positions: next
      };
      persistUserPreferencesPatch({ setLayouts: { [setId]: merged } });
    },
    [setId]
  );

  const startDrag = React.useCallback(
    (itemKey: string, event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      const target = event.currentTarget;
      const pointerId = event.pointerId;
      const startPointerX = event.clientX;
      const startPointerY = event.clientY;
      const baseline = positionsRef.current[itemKey] ?? ZERO_OFFSET;

      target.setPointerCapture(pointerId);
      setDraggingKey(itemKey);
      event.preventDefault();

      const handleMove = (move: PointerEvent): void => {
        if (move.pointerId !== pointerId) {
          return;
        }
        const dx = move.clientX - startPointerX;
        const dy = move.clientY - startPointerY;
        const next: ItemPosition = {
          x: snapToGrid(baseline.x + dx),
          y: snapToGrid(baseline.y + dy)
        };

        setPositions((current) => {
          const existing = current[itemKey];
          if (existing && existing.x === next.x && existing.y === next.y) {
            return current;
          }
          return { ...current, [itemKey]: next };
        });
      };

      const finish = (): void => {
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleEnd);
        target.removeEventListener("pointercancel", handleEnd);
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
        setDraggingKey((current) => (current === itemKey ? null : current));
        persist(positionsRef.current);
      };

      const handleEnd = (end: PointerEvent): void => {
        if (end.pointerId !== pointerId) {
          return;
        }
        finish();
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleEnd);
      target.addEventListener("pointercancel", handleEnd);
    },
    [enabled, persist]
  );

  const getOffset = React.useCallback(
    (itemKey: string): ItemPosition => positions[itemKey] ?? ZERO_OFFSET,
    [positions]
  );

  const isDragging = React.useCallback(
    (itemKey: string) => draggingKey === itemKey,
    [draggingKey]
  );

  const resetItem = React.useCallback(
    (itemKey: string) => {
      setPositions((current) => {
        if (!(itemKey in current)) {
          return current;
        }
        const next = { ...current };
        delete next[itemKey];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return {
    positions,
    getOffset,
    isDragging,
    startDrag,
    resetItem,
    enabled
  };
}

export function snapToGrid(value: number): number {
  return Math.round(value / POSITION_GRID_PX) * POSITION_GRID_PX;
}

function seedPositionsFromPreferences(setId: string | null): Record<string, ItemPosition> {
  if (!setId) {
    return {};
  }
  const layout = readLayoutForSet(setId);
  if (!layout?.positions) {
    return {};
  }
  return { ...layout.positions };
}

function readLayoutForSet(setId: string): SetLayoutPreference | undefined {
  const preferences = getCachedUserPreferences();
  return preferences.setLayouts?.[setId];
}
