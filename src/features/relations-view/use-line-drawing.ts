import * as React from "react";

export type DraftLine = {
  sourceItemKey: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type LineDrawingApi = {
  draft: DraftLine | null;
  startFromCard(itemKey: string, event: React.PointerEvent<HTMLElement>): void;
};

export type UseLineDrawingDeps = {
  /**
   * Container that the SVG line layer paints into. The hook returns
   * coordinates relative to its bounding rect so the SVG path data plugs in
   * unchanged.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /** False in move-mode — pointer-down on a card becomes a no-op. */
  enabled: boolean;
  /**
   * Resolved when the pointer-up lands on an item card different from the
   * source. The consumer is responsible for validating the pair (e.g. only
   * accept TestCase ↔ WorkItem combinations) and calling the relation
   * mutation hook.
   */
  onConnect(sourceItemKey: string, targetItemKey: string): void;
};

/**
 * Pointer-driven "draw a line from a card" gesture.
 *
 * The hook keeps no DOM, only state for the rubber-band line. Card pointer
 * handlers call {@link LineDrawingApi.startFromCard} which captures the
 * pointer, opens a draft line at the source card's anchor edge, and tracks
 * the cursor until pointer-up. On pointer-up we use
 * `document.elementFromPoint` to discover the item under the cursor and
 * invoke `onConnect` with both `data-item-key` values; anything else falls
 * through and the draft line is dismissed.
 */
export function useLineDrawing(deps: UseLineDrawingDeps): LineDrawingApi {
  const [draft, setDraft] = React.useState<DraftLine | null>(null);

  const onConnectRef = React.useRef(deps.onConnect);
  onConnectRef.current = deps.onConnect;

  const startFromCard = React.useCallback(
    (itemKey: string, event: React.PointerEvent<HTMLElement>): void => {
      if (!deps.enabled) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      const container = deps.containerRef.current;
      if (!container) {
        return;
      }
      const pointerSource = event.currentTarget;
      // The pointer-down may originate on a dedicated anchor handle nested
      // inside the card; walk up to the article that carries the
      // `data-relations-anchor` attribute for geometry.
      const sourceCard =
        pointerSource.closest<HTMLElement>("[data-relations-anchor]") ?? pointerSource;
      const containerRect = container.getBoundingClientRect();
      const anchor = readAnchorPoint(sourceCard, containerRect, container);
      if (!anchor) {
        return;
      }

      try {
        pointerSource.setPointerCapture(event.pointerId);
      } catch {
        // jsdom + some browsers reject capture on synthetic events; the
        // rest of the gesture is still tracked via window listeners below.
      }
      event.preventDefault();
      event.stopPropagation();

      const initialPoint = pointerInContainer(event.clientX, event.clientY, container);
      setDraft({
        sourceItemKey: itemKey,
        startX: anchor.x,
        startY: anchor.y,
        endX: initialPoint.x,
        endY: initialPoint.y
      });

      const pointerId = event.pointerId;

      const onMove = (move: PointerEvent): void => {
        if (move.pointerId !== pointerId) {
          return;
        }
        const point = pointerInContainer(move.clientX, move.clientY, container);
        setDraft((current) =>
          current ? { ...current, endX: point.x, endY: point.y } : current
        );
      };

      const finish = (final: PointerEvent | null): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        try {
          if (pointerSource.hasPointerCapture(pointerId)) {
            pointerSource.releasePointerCapture(pointerId);
          }
        } catch {
          // ignore — capture may not be held in jsdom
        }
        setDraft(null);
        if (final) {
          const targetItemKey = findItemKeyAtPoint(final.clientX, final.clientY);
          if (targetItemKey && targetItemKey !== itemKey) {
            onConnectRef.current(itemKey, targetItemKey);
          }
        }
      };

      const onUp = (end: PointerEvent): void => {
        if (end.pointerId !== pointerId) {
          return;
        }
        finish(end);
      };

      const onCancel = (cancel: PointerEvent): void => {
        if (cancel.pointerId !== pointerId) {
          return;
        }
        finish(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [deps.containerRef, deps.enabled]
  );

  return { draft, startFromCard };
}

function pointerInContainer(
  clientX: number,
  clientY: number,
  container: HTMLElement
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: clientX - rect.left + container.scrollLeft,
    y: clientY - rect.top + container.scrollTop
  };
}

function readAnchorPoint(
  card: HTMLElement,
  containerRect: DOMRect,
  container: HTMLElement
): { x: number; y: number } | null {
  const side = card.dataset.relationsAnchor;
  if (side !== "left" && side !== "right") {
    return null;
  }
  const rect = card.getBoundingClientRect();
  const y = rect.top + rect.height / 2 - containerRect.top + container.scrollTop;
  // `data-relations-anchor="left"` flags the card as a left-column resident
  // (test cases) — the line emerges from its right edge midpoint. The right
  // column (work items) flags itself with `right` and connects on its left
  // edge midpoint. Encoding the column instead of the geometric edge keeps
  // the markup readable when reading the card in isolation.
  const x =
    side === "left"
      ? rect.right - containerRect.left + container.scrollLeft
      : rect.left - containerRect.left + container.scrollLeft;
  return { x, y };
}

function findItemKeyAtPoint(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const target = document.elementFromPoint(clientX, clientY);
  if (!target) {
    return null;
  }
  const card = target.closest<HTMLElement>("[data-item-key]");
  return card?.dataset.itemKey ?? null;
}
