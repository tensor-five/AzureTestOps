import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { resolveAdjacentItemMove } from "./item-order.js";
import { useItemDragging } from "./use-item-dragging.js";
import { WorkItemCard } from "./work-item-card.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";

const DRAG_DATA_TYPE = "application/x-azure-testops-work-item-id";

export type WorkItemColumnProps = {
  /** Already filtered by the active filter bar. */
  workItems: readonly WorkItem[];
  /** Complete snapshot used to keep filtered-out items in the persisted order. */
  allWorkItems?: readonly WorkItem[];
  unfilteredCount: number;
  filterBar?: React.ReactNode;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  /** Persists the drag-and-drop ordering per Set; absent → fixed id sort. */
  order?: WorkItemOrderApi;
  /** Resolves the Azure DevOps deep link for a work item id, or null if unavailable. */
  getWorkItemHref?: (workItemId: number) => string | null;
  highlightQuery?: string;
  focusActive?: boolean;
  focusedWorkItemIds?: ReadonlySet<number>;
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

  const draggedIdRef = React.useRef<number | null>(null);
  const [draggedId, setDraggedId] = React.useState<number | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = React.useState("");
  const reorderInstructionId = React.useId();
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const itemDragging = useItemDragging({
    containerRef: listRef,
    rowSelector: ":scope > [data-work-item-id]",
    readItem: readWorkItemId
  });
  const naturalIds = React.useMemo(
    () => (props.allWorkItems ?? props.workItems).map((item) => item.id).sort((a, b) => a - b),
    [props.allWorkItems, props.workItems]
  );
  const naturalIdSet = React.useMemo(() => new Set(naturalIds), [naturalIds]);

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
    itemDragging.clearPreview();
  }, [itemDragging]);

  const handleListDragOver = React.useCallback(
    (event: React.DragEvent<HTMLOListElement>) => {
      if (!props.order || draggedIdRef.current === null) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      itemDragging.previewAt(event.clientY);
    },
    [props.order, itemDragging]
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
      const target = itemDragging.getPreviewTarget();
      if (
        draggedId === null ||
        !target ||
        draggedId === target.item ||
        !naturalIdSet.has(draggedId) ||
        !naturalIdSet.has(target.item)
      ) {
        handleDragEnd();
        return;
      }
      props.order.move(draggedId, target.item, target.edge, naturalIds);
      handleDragEnd();
    },
    [props.order, itemDragging, naturalIds, naturalIdSet, handleDragEnd]
  );

  const handleReorderKeyDown = React.useCallback(
    (workItemId: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!props.order || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();

      const direction = event.key === "ArrowUp" ? "up" : "down";
      const adjacentMove = resolveAdjacentItemMove(
        sorted.map((item) => item.id),
        workItemId,
        direction
      );
      if (!adjacentMove || !naturalIdSet.has(workItemId) || !naturalIdSet.has(adjacentMove.targetId)) {
        setReorderAnnouncement(
          `Work item #${workItemId} is already the ${direction === "up" ? "first" : "last"} visible work item.`
        );
        return;
      }

      props.order.move(
        workItemId,
        adjacentMove.targetId,
        adjacentMove.edge,
        naturalIds
      );
      setReorderAnnouncement(
        `Moved work item #${workItemId} ${adjacentMove.edge} work item #${adjacentMove.targetId}.`
      );
    },
    [naturalIds, naturalIdSet, props.order, sorted]
  );

  const reorderEnabled = props.order !== undefined;

  return (
    <section className="relations-view-column relations-view-column-work-items" aria-label="Work items">
      <div className="relations-view-column-sticky">
        <header className="relations-view-column-header">
          <div>
            <span className="relations-view-column-eyebrow">Saved query results</span>
            <h3>Work Items</h3>
          </div>
          <span className="relations-view-column-count">
            {sorted.length === props.unfilteredCount
              ? props.unfilteredCount
              : `${sorted.length} / ${props.unfilteredCount}`}
          </span>
        </header>
        {props.filterBar}
      </div>
      {reorderEnabled ? (
        <>
          <span id={reorderInstructionId} className="u-visually-hidden">
            Drag the reorder handle, or use Arrow Up and Arrow Down, to move the work item
            relative to visible neighbours.
          </span>
          <span
            className="u-visually-hidden"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {reorderAnnouncement}
          </span>
        </>
      ) : null}
      {props.unfilteredCount === 0 ? (
        <p className="relations-view-column-empty">No work items returned by the saved query.</p>
      ) : sorted.length === 0 ? (
        <p className="relations-view-column-empty">No work items match the active filter.</p>
      ) : (
        <ol
          ref={listRef}
          className="relations-view-work-item-list"
          onDragOver={reorderEnabled ? handleListDragOver : undefined}
          onDragLeave={reorderEnabled ? itemDragging.handleDragLeave : undefined}
          onDrop={reorderEnabled ? handleListDrop : undefined}
        >
          {sorted.map((workItem) => {
            const isFocusMatch = props.focusedWorkItemIds?.has(workItem.id) ?? false;
            const className = [
              "relations-view-work-item-list-item",
              draggedId === workItem.id ? "relations-view-work-item-list-item-dragging" : "",
              props.focusActive && isFocusMatch ? "relations-view-item-focus-match" : "",
              props.focusActive && !isFocusMatch ? "relations-view-item-focus-dimmed" : ""
            ].filter(Boolean).join(" ");
            return (
            <li key={workItem.id} className={className} data-work-item-id={workItem.id}>
              <WorkItemCard
                workItem={workItem}
                onLinePointerDown={props.onLinePointerDown}
                getWorkItemHref={props.getWorkItemHref}
                highlightQuery={props.highlightQuery}
              />
              {reorderEnabled ? (
                <button
                  type="button"
                  className="relations-view-drag-handle"
                  draggable
                  onDragStart={(event) => handleDragStart(workItem.id, event)}
                  onDragEnd={handleDragEnd}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.preventDefault()}
                  onKeyDown={(event) => handleReorderKeyDown(workItem.id, event)}
                  aria-label={`Reorder work item #${workItem.id}`}
                  aria-describedby={reorderInstructionId}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  title="Drag to reorder, or use Arrow Up and Arrow Down"
                >
                  <span aria-hidden="true">⠿</span>
                </button>
              ) : null}
            </li>
          );})}
        </ol>
      )}
    </section>
  );
}

function readWorkItemId(row: HTMLElement): number | null {
  const id = Number.parseInt(row.dataset.workItemId ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
