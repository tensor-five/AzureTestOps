import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { resolveAdjacentItemMove } from "./item-order.js";
import { useItemDragging } from "./use-item-dragging.js";
import { WorkItemCard } from "./work-item-card.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";
import { projectVisibleSpacerLayout, type WorkItemSpacerToken } from "./work-item-spacer-layout.js";

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
  /** Enables free vertical spacer slots between visible Bugs. */
  addSpacer?: boolean;
  /** Vertical positions in the visible Bug layout when Add Spacer is enabled. */
  workItemPositions?: Readonly<Record<number, number>>;
  /** Persists a manual visible Bug order into the existing free Spacer slots. */
  onSpacerPositionsChange?(
    visibleIds: readonly number[],
    nextPositions: Readonly<Record<number, number>>
  ): void;
  /** Shared Bug/Spacer stack; numeric entries are Bug ids, null entries are fixed slots. */
  spacerLayout?: readonly WorkItemSpacerToken[];
  onSpacerTokenMove?(sourceWorkItemId: number, targetTokenIndex: number): void;
  /** Resolves the Azure DevOps deep link for a work item id, or null if unavailable. */
  getWorkItemHref?: (workItemId: number) => string | null;
  highlightQuery?: string;
  focusActive?: boolean;
  focusedWorkItemIds?: ReadonlySet<number>;
  onFocusWorkItem?(workItemId: number): void;
};

export function WorkItemColumn(props: WorkItemColumnProps): React.ReactElement {
  const baseSorted = React.useMemo(
    () => props.workItems.slice().sort((a, b) => a.id - b.id),
    [props.workItems]
  );

  const sorted = React.useMemo(
    () => {
      const ordered = props.order ? props.order.sortByStoredOrder(baseSorted) : baseSorted;
      if (!props.addSpacer || !props.workItemPositions) {
        return ordered;
      }
      const orderIndex = new Map(ordered.map((item, index) => [item.id, index]));
      return ordered.slice().sort((left, right) => (props.workItemPositions![left.id] ?? 0)
        - (props.workItemPositions![right.id] ?? 0)
        || (orderIndex.get(left.id) ?? 0) - (orderIndex.get(right.id) ?? 0));
    },
    [baseSorted, props.addSpacer, props.order, props.workItemPositions]
  );
  const visibleSpacerTokens = React.useMemo(
    () => props.addSpacer && props.spacerLayout
      ? projectVisibleSpacerLayout(props.spacerLayout, new Set(props.workItems.map((item) => item.id)))
      : [],
    [props.addSpacer, props.spacerLayout, props.workItems]
  );
  const spacerTokenMode = visibleSpacerTokens.length > 0 && props.onSpacerTokenMove !== undefined;
  const trailingSpacerTokens = React.useMemo(() => {
    let lastWorkItemIndex = -1;
    visibleSpacerTokens.forEach((token, index) => {
      if (token.workItemId !== null) lastWorkItemIndex = index;
    });
    return visibleSpacerTokens.slice(lastWorkItemIndex + 1).filter((token) => token.workItemId === null);
  }, [visibleSpacerTokens]);
  const workItemsById = React.useMemo(() => new Map(props.workItems.map((item) => [item.id, item])), [props.workItems]);
  const displayedItems = React.useMemo(
    () => spacerTokenMode
      ? visibleSpacerTokens.flatMap((token) => token.workItemId === null ? [] : [workItemsById.get(token.workItemId)!])
      : sorted,
    [sorted, spacerTokenMode, visibleSpacerTokens, workItemsById]
  );

  const draggedIdRef = React.useRef<number | null>(null);
  const [draggedId, setDraggedId] = React.useState<number | null>(null);
  const [spacerDropPreview, setSpacerDropPreview] = React.useState<string | null>(null);
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
    setSpacerDropPreview(null);
    itemDragging.clearPreview();
  }, [itemDragging]);

  const applyManualMove = React.useCallback(
    (draggedWorkItemId: number, targetWorkItemId: number, edge: "before" | "after") => {
      if (
        !props.order ||
        draggedWorkItemId === targetWorkItemId ||
        !naturalIdSet.has(draggedWorkItemId) ||
        !naturalIdSet.has(targetWorkItemId)
      ) {
        return;
      }
      props.order.move(draggedWorkItemId, targetWorkItemId, edge, naturalIds);
      if (props.addSpacer && props.workItemPositions && props.onSpacerPositionsChange) {
        const visibleIds = sorted.map((item) => item.id);
        props.onSpacerPositionsChange(
          visibleIds,
          reorderIntoExistingSpacerSlots(
            visibleIds,
            props.workItemPositions,
            draggedWorkItemId,
            targetWorkItemId,
            edge
          )
        );
      }
    },
    [naturalIds, naturalIdSet, props.addSpacer, props.onSpacerPositionsChange, props.order, props.workItemPositions, sorted]
  );

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
      applyManualMove(draggedId, target.item, target.edge);
      handleDragEnd();
    },
    [applyManualMove, props.order, itemDragging, naturalIdSet, handleDragEnd]
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

      applyManualMove(workItemId, adjacentMove.targetId, adjacentMove.edge);
      setReorderAnnouncement(
        `Moved work item #${workItemId} ${adjacentMove.edge} work item #${adjacentMove.targetId}.`
      );
    },
    [applyManualMove, naturalIdSet, props.order, sorted]
  );

  const handleSpacerDragOver = React.useCallback(
    (previousWorkItemId: number | undefined, followingWorkItemId: number, spacerIndex: number, event: React.DragEvent<HTMLLIElement>) => {
      if (!props.order || draggedIdRef.current === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const tokenIndex = Number(event.currentTarget.dataset.spacerSlotIndex);
      if (props.onSpacerTokenMove && Number.isInteger(tokenIndex)) {
        setSpacerDropPreview(`slot:${tokenIndex}`);
        return;
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      const edge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setSpacerDropPreview(`${previousWorkItemId ?? "start"}:${followingWorkItemId}:${spacerIndex}:${edge}`);
    },
    [props.onSpacerTokenMove, props.order]
  );

  const handleSpacerDrop = React.useCallback(
    (previousWorkItemId: number | undefined, followingWorkItemId: number, spacerIndex: number, event: React.DragEvent<HTMLLIElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const raw = event.dataTransfer.getData(DRAG_DATA_TYPE);
      const parsed = Number.parseInt(raw, 10);
      const source = Number.isFinite(parsed) && parsed > 0 ? parsed : draggedIdRef.current;
      if (source !== null && props.onSpacerTokenMove && props.spacerLayout) {
        const tokenIndex = Number(event.currentTarget.dataset.spacerSlotIndex);
        if (Number.isInteger(tokenIndex)) props.onSpacerTokenMove(source, tokenIndex);
        handleDragEnd();
        return;
      }
      const preview = spacerDropPreview?.split(":");
      const edge = preview?.[0] === String(previousWorkItemId ?? "start")
        && preview[1] === String(followingWorkItemId)
        && preview[2] === String(spacerIndex)
        && preview[3] === "after"
        ? "after"
        : "before";
      const target = edge === "before" ? previousWorkItemId ?? followingWorkItemId : followingWorkItemId;
      const targetEdge = edge === "before" && previousWorkItemId !== undefined
        ? "after"
        : edge === "after"
          ? "before"
          : "before";
      if (source !== null) {
        applyManualMove(source, target, targetEdge);
      }
      handleDragEnd();
    },
    [applyManualMove, handleDragEnd, props.onSpacerTokenMove, props.spacerLayout, spacerDropPreview]
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
            relative to visible neighbours and fixed Spacer blocks.
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
          {displayedItems.flatMap((workItem, index) => {
            const isFocusMatch = props.focusedWorkItemIds?.has(workItem.id) ?? false;
            const className = [
              "relations-view-work-item-list-item",
              draggedId === workItem.id ? "relations-view-work-item-list-item-dragging" : "",
              props.focusActive && isFocusMatch ? "relations-view-item-focus-match" : "",
              props.focusActive && !isFocusMatch ? "relations-view-item-focus-dimmed" : ""
            ].filter(Boolean).join(" ");
            const previous = displayedItems[index - 1];
            const spacerTokensBefore = spacerTokenMode
              ? visibleSpacerTokens.slice(
                index === 0 ? 0 : visibleSpacerTokens.findIndex((token) => token.workItemId === previous?.id) + 1,
                visibleSpacerTokens.findIndex((token) => token.workItemId === workItem.id)
              ).filter((token) => token.workItemId === null)
              : [];
            const spacerCount = !spacerTokenMode && props.addSpacer && props.workItemPositions
              ? previous
                ? Math.max(0, (props.workItemPositions[workItem.id] ?? index)
                  - (props.workItemPositions[previous.id] ?? index - 1) - 1)
                : Math.max(0, props.workItemPositions[workItem.id] ?? 0)
              : 0;
            return [
              ...(spacerTokenMode ? spacerTokensBefore : Array.from({ length: spacerCount }, (_, spacerIndex) => ({ tokenIndex: spacerIndex, workItemId: null }))).map((spacerToken, spacerIndex) => (
                <li
                  key={`spacer-${spacerTokenMode ? spacerToken.tokenIndex : `${previous?.id ?? "start"}-${workItem.id}-${spacerIndex}`}`}
                  className="relations-view-work-item-spacer"
                  {...(previous ? { "data-work-item-spacer": "" } : { "data-work-item-leading-spacer": "" })}
                  {...(spacerTokenMode ? { "data-spacer-slot-index": spacerToken.tokenIndex } : {})}
                  data-spacer-drop-target=""
                  {...spacerDropPreview === `${previous?.id ?? "start"}:${workItem.id}:${spacerIndex}:before`
                    ? { "data-drop-edge": "before" }
                    : spacerDropPreview === `${previous?.id ?? "start"}:${workItem.id}:${spacerIndex}:after`
                      ? { "data-drop-edge": "after" }
                      : {}}
                  aria-label="Drop Bug here"
                  {...(spacerTokenMode && spacerDropPreview === `slot:${spacerToken.tokenIndex}` ? { "data-drop-preview": "true" } : {})}
                  onDragOver={(event) => handleSpacerDragOver(previous?.id, workItem.id, spacerIndex, event)}
                  onDrop={(event) => handleSpacerDrop(previous?.id, workItem.id, spacerIndex, event)}
                  onDragLeave={() => setSpacerDropPreview(null)}
                />
              )),
              <li key={workItem.id} className={className} data-work-item-id={workItem.id}>
              <WorkItemCard
                workItem={workItem}
                onLinePointerDown={props.onLinePointerDown}
                getWorkItemHref={props.getWorkItemHref}
                highlightQuery={props.highlightQuery}
                onFocus={workItem.workItemType.trim().toLowerCase() === "bug"
                  ? () => props.onFocusWorkItem?.(workItem.id)
                  : undefined}
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
            ];
          })}
          {spacerTokenMode
            ? trailingSpacerTokens.map((token) => (
                <li
                  key={`spacer-${token.tokenIndex}`}
                  className="relations-view-work-item-spacer"
                  data-work-item-spacer=""
                  data-spacer-slot-index={token.tokenIndex}
                  data-spacer-drop-target=""
                  aria-label="Drop Bug here"
                  {...(spacerDropPreview === `slot:${token.tokenIndex}` ? { "data-drop-preview": "true" } : {})}
                  onDragOver={(event) => handleSpacerDragOver(undefined, 0, token.tokenIndex, event)}
                  onDrop={(event) => handleSpacerDrop(undefined, 0, token.tokenIndex, event)}
                  onDragLeave={() => setSpacerDropPreview(null)}
                />
              ))
            : null}
        </ol>
      )}
    </section>
  );
}

function readWorkItemId(row: HTMLElement): number | null {
  const id = Number.parseInt(row.dataset.workItemId ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function reorderIntoExistingSpacerSlots(
  visibleIds: readonly number[],
  positions: Readonly<Record<number, number>>,
  sourceId: number,
  targetId: number,
  edge: "before" | "after"
): Record<number, number> {
  const reorderedIds = visibleIds.filter((id) => id !== sourceId);
  const targetIndex = reorderedIds.indexOf(targetId);
  if (targetIndex === -1) {
    return Object.fromEntries(visibleIds.map((id, index) => [id, positions[id] ?? index]));
  }
  reorderedIds.splice(edge === "after" ? targetIndex + 1 : targetIndex, 0, sourceId);
  const spacerSlots = visibleIds
    .map((id, index) => positions[id] ?? index)
    .sort((left, right) => left - right);
  return Object.fromEntries(reorderedIds.map((id, index) => [id, spacerSlots[index]! ]));
}
