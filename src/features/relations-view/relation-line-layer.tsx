import * as React from "react";

import type { DraftLine } from "./use-line-drawing.js";

export type LineSpec = {
  lineId: string;
  testCaseItemKey: string;
  workItemItemKey: string;
  testCaseWorkItemId: number;
  workItemWorkItemId: number;
  pending: boolean;
};

export type LineCoords = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export type RelationLineLayerProps = {
  /**
   * The DOM element that anchors line coordinates. Passed as a value (not a
   * ref) so a `null → element` transition triggers a re-render and re-runs
   * the layout effect; with a ref we'd miss the initial mount because the
   * layer's `useLayoutEffect` fires before the parent's section ref callback.
   */
  container: HTMLElement | null;
  lines: readonly LineSpec[];
  draft: DraftLine | null;
  selectedLineId: string | null;
  onSelectLine: (lineId: string | null) => void;
  /** Forces an extra recompute when the caller knows positions have moved. */
  layoutVersion: number;
};

/**
 * SVG overlay that draws relation lines over the two-column layout.
 *
 * The wrapper has `pointer-events: none` so cards behind it stay
 * interactive; per-line `<g>`s opt back in via `pointer-events: stroke` so
 * only line clicks select. A wider transparent "hitbox" stroke renders
 * underneath each visible stroke to make hovering/selecting forgiving on
 * thin lines.
 *
 * Coordinates are recomputed in a layout effect against the container's
 * client rect, on every render and whenever the surrounding layout changes
 * (cards added/removed, dragged, container resized, scrolled).
 */
export function RelationLineLayer(props: RelationLineLayerProps): React.ReactElement {
  const [coords, setCoords] = React.useState<Map<string, LineCoords>>(() => new Map());

  React.useLayoutEffect(() => {
    const container = props.container;
    if (!container) {
      return undefined;
    }

    const recompute = (): void => {
      const next = computeLineCoords(container, props.lines);
      setCoords(next);
    };

    recompute();

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(recompute)
      : null;
    if (resizeObserver) {
      resizeObserver.observe(container);
      for (const line of props.lines) {
        const sourceCard = container.querySelector<HTMLElement>(
          `[data-item-key="${cssAttr(line.testCaseItemKey)}"]`
        );
        const targetCard = container.querySelector<HTMLElement>(
          `[data-item-key="${cssAttr(line.workItemItemKey)}"]`
        );
        if (sourceCard) resizeObserver.observe(sourceCard);
        if (targetCard) resizeObserver.observe(targetCard);
      }
    }

    const onWindowChange = (): void => recompute();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [props.lines, props.layoutVersion, props.container]);

  const onWrapperPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    // Clicks on the SVG background (not on a line stroke) clear selection.
    if (event.target === event.currentTarget) {
      props.onSelectLine(null);
    }
  };

  return (
    <svg
      className="relations-view-line-layer"
      aria-hidden
      onPointerDown={onWrapperPointerDown}
    >
      {props.lines.map((line) => {
        const c = coords.get(line.lineId);
        if (!c) {
          return null;
        }
        const selected = line.lineId === props.selectedLineId;
        const className = [
          "relations-view-line",
          selected ? "relations-view-line-selected" : "",
          line.pending ? "relations-view-line-pending" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g
            key={line.lineId}
            className={className}
            data-line-id={line.lineId}
            onPointerDown={(event) => {
              event.stopPropagation();
              props.onSelectLine(line.lineId);
            }}
          >
            <line
              className="relations-view-line-hitbox"
              x1={c.fromX}
              y1={c.fromY}
              x2={c.toX}
              y2={c.toY}
            />
            <line
              className="relations-view-line-stroke"
              x1={c.fromX}
              y1={c.fromY}
              x2={c.toX}
              y2={c.toY}
            />
          </g>
        );
      })}
      {props.draft ? (
        <line
          className="relations-view-line-draft"
          x1={props.draft.startX}
          y1={props.draft.startY}
          x2={props.draft.endX}
          y2={props.draft.endY}
        />
      ) : null}
    </svg>
  );
}

function computeLineCoords(
  container: HTMLElement,
  lines: readonly LineSpec[]
): Map<string, LineCoords> {
  const next = new Map<string, LineCoords>();
  const containerRect = container.getBoundingClientRect();
  for (const line of lines) {
    const source = container.querySelector<HTMLElement>(
      `[data-item-key="${cssAttr(line.testCaseItemKey)}"]`
    );
    const target = container.querySelector<HTMLElement>(
      `[data-item-key="${cssAttr(line.workItemItemKey)}"]`
    );
    if (!source || !target) {
      continue;
    }
    const fromAnchor = readAnchorPoint(source, containerRect, container);
    const toAnchor = readAnchorPoint(target, containerRect, container);
    if (!fromAnchor || !toAnchor) {
      continue;
    }
    next.set(line.lineId, {
      fromX: fromAnchor.x,
      fromY: fromAnchor.y,
      toX: toAnchor.x,
      toY: toAnchor.y
    });
  }
  return next;
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
  const x =
    side === "left"
      ? rect.right - containerRect.left + container.scrollLeft
      : rect.left - containerRect.left + container.scrollLeft;
  return { x, y };
}

function cssAttr(value: string): string {
  return value.replace(/"/g, '\\"');
}
