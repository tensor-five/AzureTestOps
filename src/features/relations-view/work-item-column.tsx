import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { WorkItemCard } from "./work-item-card.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";

const DRAG_DATA_TYPE = "application/x-azure-testops-work-item-id";
const DRAG_DROP_EDGE_ATTR = "data-drop-edge";

export type WorkItemColumnProps = {
  /** Already filtered by the active filter bar. */
  workItems: readonly WorkItem[];
  unfilteredCount: number;
  filterBar?: React.ReactNode;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  /** Persists the drag-and-drop ordering per Set; absent → fixed id sort. */
  order?: WorkItemOrderApi;
};

type DropTarget = { workItemId: number; edge: "before" | "after"; element: HTMLElement };

export function WorkItemColumn(props: WorkItemColumnProps): React.ReactElement {
  const baseSorted = React.useMemo(
    () => props.workItems.slice().sort((a, b) => a.id - b.id),
    [props.workItems]
  );

  const sorted = React.useMemo(
    () => (props.order ? props.order.sortByStoredOrder(baseSorted) : baseSorted),
    [baseSorted, props.order]
  );

  const draggedIdRef = React.useRef<number | null>(null);
  const [draggedId, setDraggedId] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);

  const clearDropEdges = React.useCallback(() => {
    const ol = listRef.current;
    if (!ol) {
      return;
    }
    ol.querySelectorAll(`[${DRAG_DROP_EDGE_ATTR}]`).forEach((el) =>
      el.removeAttribute(DRAG_DROP_EDGE_ATTR)
    );
  }, []);

  const handleDragStart = React.useCallback(
    (workItemId: number, event: React.DragEvent<HTMLElement>) => {
      if (!props.order) {
        return;
      }
      event.dataTransfer.setData(DRAG_DATA_TYPE, String(workItemId));
      event.dataTransfer.effectAllowed = "move";
      const card = event.currentTarget.closest("li")?.querySelector<HTMLElement>(
        ".relations-view-card-work-item"
      );
      if (card && typeof event.dataTransfer.setDragImage === "function") {
        event.dataTransfer.setDragImage(card, 12, 12);
      }
      draggedIdRef.current = workItemId;
      setDraggedId(workItemId);
    },
    [props.order]
  );

  const handleDragEnd = React.useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    clearDropEdges();
  }, [clearDropEdges]);

  const resolveDropTarget = React.useCallback(
    (clientY: number): DropTarget | null => {
      const ol = listRef.current;
      if (!ol) {
        return null;
      }
      const rows = Array.from(
        ol.querySelectorAll<HTMLElement>(":scope > [data-work-item-id]")
      );
      if (rows.length === 0) {
        return null;
      }
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (clientY < midpoint) {
          const id = Number.parseInt(row.dataset.workItemId ?? "", 10);
          if (!Number.isFinite(id)) {
            return null;
          }
          return { workItemId: id, edge: "before", element: row };
        }
      }
      const last = rows[rows.length - 1];
      const id = Number.parseInt(last.dataset.workItemId ?? "", 10);
      if (!Number.isFinite(id)) {
        return null;
      }
      return { workItemId: id, edge: "after", element: last };
    },
    []
  );

  const handleListDragOver = React.useCallback(
    (event: React.DragEvent<HTMLOListElement>) => {
      if (!props.order || draggedIdRef.current === null) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = resolveDropTarget(event.clientY);
      if (!target) {
        return;
      }
      const ol = listRef.current;
      if (!ol) {
        return;
      }
      ol.querySelectorAll(`[${DRAG_DROP_EDGE_ATTR}]`).forEach((el) => {
        if (el !== target.element) {
          el.removeAttribute(DRAG_DROP_EDGE_ATTR);
        }
      });
      if (target.element.getAttribute(DRAG_DROP_EDGE_ATTR) !== target.edge) {
        target.element.setAttribute(DRAG_DROP_EDGE_ATTR, target.edge);
      }
    },
    [props.order, resolveDropTarget]
  );

  const handleListDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLOListElement>) => {
      // dragleave fires when the pointer moves from the OL into a descendant
      // too. Only clear the edge marker when we truly leave the list, i.e.
      // the relatedTarget is outside this OL.
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) {
        return;
      }
      clearDropEdges();
    },
    [clearDropEdges]
  );

  const handleListDrop = React.useCallback(
    (event: React.DragEvent<HTMLOListElement>) => {
      if (!props.order) {
        return;
      }
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_DATA_TYPE);
      const draggedFromData = Number.parseInt(raw, 10);
      const draggedFromState = draggedIdRef.current;
      const draggedId = Number.isFinite(draggedFromData) && draggedFromData > 0
        ? draggedFromData
        : draggedFromState;
      const target = resolveDropTarget(event.clientY);
      if (draggedId === null || !target || draggedId === target.workItemId) {
        handleDragEnd();
        return;
      }
      props.order.move(draggedId, target.workItemId, target.edge);
      handleDragEnd();
    },
    [props.order, resolveDropTarget, handleDragEnd]
  );

  const reorderEnabled = props.order !== undefined;

  return (
    <section className="relations-view-column relations-view-column-work-items" aria-label="Work items">
      <header className="relations-view-column-header">
        <h3>Work Items</h3>
        <span className="relations-view-column-count">
          {sorted.length === props.unfilteredCount
            ? props.unfilteredCount
            : `${sorted.length} / ${props.unfilteredCount}`}
        </span>
      </header>
      {props.filterBar}
      {props.unfilteredCount === 0 ? (
        <p className="relations-view-column-empty">No work items returned by the saved query.</p>
      ) : sorted.length === 0 ? (
        <p className="relations-view-column-empty">No work items match the active filter.</p>
      ) : (
        <ol
          ref={listRef}
          className="relations-view-work-item-list"
          onDragOver={reorderEnabled ? handleListDragOver : undefined}
          onDragLeave={reorderEnabled ? handleListDragLeave : undefined}
          onDrop={reorderEnabled ? handleListDrop : undefined}
        >
          {sorted.map((workItem) => (
            <li
              key={workItem.id}
              className={
                draggedId === workItem.id
                  ? "relations-view-work-item-list-item relations-view-work-item-list-item-dragging"
                  : "relations-view-work-item-list-item"
              }
              data-work-item-id={workItem.id}
            >
              {reorderEnabled ? (
                <button
                  type="button"
                  className="relations-view-drag-handle"
                  draggable
                  onDragStart={(event) => handleDragStart(workItem.id, event)}
                  onDragEnd={handleDragEnd}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.preventDefault()}
                  aria-label={`Reorder work item #${workItem.id}`}
                  title="Drag to reorder"
                >
                  <span aria-hidden="true">⠿</span>
                </button>
              ) : null}
              <WorkItemCard
                workItem={workItem}
                onLinePointerDown={props.onLinePointerDown}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
