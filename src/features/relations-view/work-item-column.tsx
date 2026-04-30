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

export function WorkItemColumn(props: WorkItemColumnProps): React.ReactElement {
  const baseSorted = React.useMemo(
    () => props.workItems.slice().sort((a, b) => a.id - b.id),
    [props.workItems]
  );

  const sorted = React.useMemo(
    () => (props.order ? props.order.sortByStoredOrder(baseSorted) : baseSorted),
    [baseSorted, props.order]
  );

  const dragState = React.useRef<{ draggedId: number | null }>({ draggedId: null });
  const [draggedId, setDraggedId] = React.useState<number | null>(null);

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
      dragState.current.draggedId = workItemId;
      setDraggedId(workItemId);
    },
    [props.order]
  );

  const handleDragEnd = React.useCallback(() => {
    dragState.current.draggedId = null;
    setDraggedId(null);
    document
      .querySelectorAll(`[${DRAG_DROP_EDGE_ATTR}]`)
      .forEach((el) => el.removeAttribute(DRAG_DROP_EDGE_ATTR));
  }, []);

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLLIElement>) => {
      if (!props.order || dragState.current.draggedId === null) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const li = event.currentTarget;
      const rect = li.getBoundingClientRect();
      const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      if (li.getAttribute(DRAG_DROP_EDGE_ATTR) !== edge) {
        li.setAttribute(DRAG_DROP_EDGE_ATTR, edge);
      }
    },
    [props.order]
  );

  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLLIElement>) => {
    event.currentTarget.removeAttribute(DRAG_DROP_EDGE_ATTR);
  }, []);

  const handleDrop = React.useCallback(
    (targetId: number, event: React.DragEvent<HTMLLIElement>) => {
      if (!props.order) {
        return;
      }
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_DATA_TYPE);
      const draggedFromData = Number.parseInt(raw, 10);
      const draggedFromState = dragState.current.draggedId;
      const draggedId = Number.isFinite(draggedFromData) && draggedFromData > 0
        ? draggedFromData
        : draggedFromState;
      if (draggedId === null || draggedId === targetId) {
        handleDragEnd();
        return;
      }
      const li = event.currentTarget;
      const rect = li.getBoundingClientRect();
      const edge: "before" | "after" =
        event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      props.order.move(draggedId, targetId, edge);
      handleDragEnd();
    },
    [props.order, handleDragEnd]
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
        <ol className="relations-view-work-item-list">
          {sorted.map((workItem) => (
            <li
              key={workItem.id}
              className={
                draggedId === workItem.id
                  ? "relations-view-work-item-list-item relations-view-work-item-list-item-dragging"
                  : "relations-view-work-item-list-item"
              }
              data-work-item-id={workItem.id}
              onDragOver={reorderEnabled ? handleDragOver : undefined}
              onDragLeave={reorderEnabled ? handleDragLeave : undefined}
              onDrop={reorderEnabled ? (event) => handleDrop(workItem.id, event) : undefined}
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
