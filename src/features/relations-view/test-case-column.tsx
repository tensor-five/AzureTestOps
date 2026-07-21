import * as React from "react";

import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { HighlightedText } from "../../shared/search/highlighted-text.js";
import { ChevronIcon } from "../../shared/ui/chevron-icon.js";
import { resolveAdjacentItemMove } from "./item-order.js";
import { TestCaseCard } from "./test-case-card.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";
import { useItemDragging } from "./use-item-dragging.js";
import type { TestCaseOrderApi } from "./use-test-case-order.js";
import {
  buildSuiteExplorerEntries,
  selectVisibleSuiteEntries,
  type SuiteExplorerEntry
} from "./suite-explorer.js";

const DRAG_DATA_TYPE = "application/x-azure-testops-test-case";

export type TestCaseColumnProps = {
  suiteTree: TestSuiteNode;
  projections: readonly TestCaseProjection[];
  allProjections?: readonly TestCaseProjection[];
  unfilteredCount: number;
  collapse: SuiteCollapseApi;
  filterBar?: React.ReactNode;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  order?: TestCaseOrderApi;
  getWorkItemHref?: (workItemId: number) => string | null;
  getSuiteHref?: (suiteId: number) => string | null;
  searchQuery?: string;
  hideEmptySuites?: boolean;
  onHideEmptySuitesChange?(next: boolean): void;
  focusedSuiteId?: number | null;
  focusedSuiteIds?: ReadonlySet<number>;
  onFocusSuite?(suiteId: number | null): void;
};

type DragSource = { workItemId: number; suiteId: number };

export function TestCaseColumn(props: TestCaseColumnProps): React.ReactElement {
  const entries = React.useMemo(
    () => buildSuiteExplorerEntries(
      props.suiteTree,
      props.projections,
      props.allProjections ?? props.projections
    ),
    [props.suiteTree, props.projections, props.allProjections]
  );
  const visibleEntries = React.useMemo(
    () => selectVisibleSuiteEntries(entries, props.collapse, {
      hideEmptySuites: props.hideEmptySuites ?? false,
      searchQuery: props.searchQuery ?? ""
    }),
    [entries, props.collapse, props.hideEmptySuites, props.searchQuery]
  );
  const collapsibleSuiteIds = React.useMemo(
    () => entries
      .filter((entry) => entry.hasChildren || entry.totalProjectionCount > 0)
      .map((entry) => entry.suite.id),
    [entries]
  );

  const visibleProjectionCount = props.projections.length;
  const dragSourceRef = React.useRef<DragSource | null>(null);
  const [draggedKey, setDraggedKey] = React.useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = React.useState("");
  const reorderInstructionId = React.useId();
  const listRef = React.useRef<HTMLOListElement | null>(null);

  const beginDrag = React.useCallback(
    (workItemId: number, suiteId: number, event: React.DragEvent<HTMLElement>) => {
      if (!props.order) {
        return;
      }
      event.dataTransfer.setData(DRAG_DATA_TYPE, `${workItemId}:${suiteId}`);
      event.dataTransfer.effectAllowed = "move";
      const card = event.currentTarget
        .closest(".relations-view-test-case-row")
        ?.querySelector<HTMLElement>(".relations-view-card-test-case");
      if (card && typeof event.dataTransfer.setDragImage === "function") {
        event.dataTransfer.setDragImage(card, 12, 12);
      }
      dragSourceRef.current = { workItemId, suiteId };
      setDraggedKey(`${workItemId}::${suiteId}`);
    },
    [props.order]
  );

  const endDrag = React.useCallback(() => {
    dragSourceRef.current = null;
    setDraggedKey(null);
  }, []);

  const handleTreeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLOListElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".relations-view-suite-toggle"
      );
      const list = listRef.current;
      if (!target || !list) {
        return;
      }
      const buttons = Array.from(
        list.querySelectorAll<HTMLButtonElement>(".relations-view-suite-toggle")
      );
      const index = buttons.indexOf(target);
      if (index === -1) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = event.key === "ArrowDown"
          ? Math.min(buttons.length - 1, index + 1)
          : Math.max(0, index - 1);
        buttons[nextIndex]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
      } else if (
        event.key === "ArrowRight" &&
        target.getAttribute("aria-expanded") === "false"
      ) {
        event.preventDefault();
        target.click();
      } else if (event.key === "ArrowLeft") {
        if (target.getAttribute("aria-expanded") === "true") {
          event.preventDefault();
          target.click();
        } else if (target.dataset.parentSuiteId) {
          event.preventDefault();
          list.querySelector<HTMLButtonElement>(
            `.relations-view-suite-toggle[data-suite-id="${target.dataset.parentSuiteId}"]`
          )?.focus();
        }
      }
    },
    []
  );

  return (
    <section className="relations-view-column relations-view-column-test-cases" aria-label="Test cases">
      <div className="relations-view-column-sticky">
        <header className="relations-view-column-header">
          <div>
            <span className="relations-view-column-eyebrow">Test plan explorer</span>
            <h3>Test Cases</h3>
          </div>
          <span className="relations-view-column-count">
            {visibleProjectionCount === props.unfilteredCount
              ? props.unfilteredCount
              : `${visibleProjectionCount} / ${props.unfilteredCount}`}
          </span>
        </header>
        {props.filterBar}
        <div className="relations-view-suite-toolbar" aria-label="Suite tree controls">
          <button type="button" onClick={props.collapse.expandAll}>Expand all</button>
          <button type="button" onClick={() => props.collapse.collapseAll(collapsibleSuiteIds)}>
            Collapse all
          </button>
          <label className="relations-view-suite-hide-empty">
            <input
              type="checkbox"
              checked={props.hideEmptySuites ?? false}
              onChange={(event) => props.onHideEmptySuitesChange?.(event.currentTarget.checked)}
            />
            <span>Hide empty suites</span>
          </label>
        </div>
      </div>

      {props.order ? (
        <>
          <span id={reorderInstructionId} className="u-visually-hidden">
            Drag the reorder handle, or use Arrow Up and Arrow Down, to move the test case
            within its suite relative to visible neighbours.
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
        <p className="relations-view-column-empty">No test cases in this set.</p>
      ) : visibleProjectionCount === 0 ? (
        <p className="relations-view-column-empty">No test cases match the active filter.</p>
      ) : visibleEntries.length === 0 ? (
        <p className="relations-view-column-empty">No suites match the active view.</p>
      ) : (
        <ol
          className="relations-view-suite-list"
          aria-label="Test suite hierarchy"
          ref={listRef}
          onKeyDown={handleTreeKeyDown}
        >
          {visibleEntries.map((entry) => (
            <SuiteGroup
              key={entry.suite.id}
              entry={entry}
              collapse={props.collapse}
              onLinePointerDown={props.onLinePointerDown}
              getWorkItemHref={props.getWorkItemHref}
              order={props.order}
              dragSourceRef={dragSourceRef}
              draggedKey={draggedKey}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
              reorderInstructionId={reorderInstructionId}
              onReorderAnnouncement={setReorderAnnouncement}
              getSuiteHref={props.getSuiteHref}
              searchQuery={props.searchQuery ?? ""}
              focusedSuiteId={props.focusedSuiteId ?? null}
              focusedSuiteIds={props.focusedSuiteIds}
              onFocusSuite={props.onFocusSuite}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SuiteGroup(props: {
  entry: SuiteExplorerEntry;
  collapse: SuiteCollapseApi;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  getWorkItemHref?: (workItemId: number) => string | null;
  order?: TestCaseOrderApi;
  dragSourceRef: React.MutableRefObject<DragSource | null>;
  draggedKey: string | null;
  onDragStart(workItemId: number, suiteId: number, event: React.DragEvent<HTMLElement>): void;
  onDragEnd(): void;
  reorderInstructionId: string;
  onReorderAnnouncement(message: string): void;
  getSuiteHref?: (suiteId: number) => string | null;
  searchQuery: string;
  focusedSuiteId: number | null;
  focusedSuiteIds?: ReadonlySet<number>;
  onFocusSuite?: (suiteId: number | null) => void;
}): React.ReactElement {
  const { entry } = props;
  const order = props.order;
  const dragSourceRef = props.dragSourceRef;
  const onDragEnd = props.onDragEnd;
  const onReorderAnnouncement = props.onReorderAnnouncement;
  const searchActive = props.searchQuery.trim().length > 0;
  const isCollapsed = !searchActive && props.collapse.isCollapsed(entry.suite.id);
  const suiteHref = props.getSuiteHref?.(entry.suite.id) ?? null;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const itemDragging = useItemDragging({
    containerRef,
    rowSelector: ":scope > [data-test-case-id]",
    readItem: readTestCaseId
  });
  const ordered = React.useMemo(
    () => props.order
      ? props.order.sortByStoredOrder(entry.suite.id, entry.projections)
      : entry.projections,
    [props.order, entry.projections, entry.suite.id]
  );
  const naturalIdSet = React.useMemo(() => new Set(entry.naturalIds), [entry.naturalIds]);

  React.useEffect(() => {
    if (props.draggedKey === null) {
      itemDragging.clearPreview();
    }
  }, [props.draggedKey, itemDragging]);

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const source = dragSourceRef.current;
      if (!order || !source || source.suiteId !== entry.suite.id) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      itemDragging.previewAt(event.clientY);
    },
    [dragSourceRef, entry.suite.id, itemDragging, order]
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const source = dragSourceRef.current;
      if (!order || !source || source.suiteId !== entry.suite.id) {
        return;
      }
      event.preventDefault();
      const target = itemDragging.getPreviewTarget();
      if (
        !target ||
        target.item === source.workItemId ||
        !naturalIdSet.has(source.workItemId) ||
        !naturalIdSet.has(target.item)
      ) {
        onDragEnd();
        return;
      }
      order.move(
        entry.suite.id,
        source.workItemId,
        target.item,
        target.edge,
        entry.naturalIds
      );
      onDragEnd();
    },
    [dragSourceRef, entry.suite.id, entry.naturalIds, itemDragging, naturalIdSet, onDragEnd, order]
  );

  const handleReorderKeyDown = React.useCallback(
    (workItemId: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!order || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      const direction = event.key === "ArrowUp" ? "up" : "down";
      const adjacentMove = resolveAdjacentItemMove(
        ordered.map((projection) => projection.workItemId),
        workItemId,
        direction
      );
      if (!adjacentMove || !naturalIdSet.has(workItemId) || !naturalIdSet.has(adjacentMove.targetId)) {
        onReorderAnnouncement(
          `Test case #${workItemId} is already the ${direction === "up" ? "first" : "last"} visible test case in this suite.`
        );
        return;
      }
      order.move(
        entry.suite.id,
        workItemId,
        adjacentMove.targetId,
        adjacentMove.edge,
        entry.naturalIds
      );
      onReorderAnnouncement(
        `Moved test case #${workItemId} ${adjacentMove.edge} test case #${adjacentMove.targetId} in this suite.`
      );
    },
    [entry.naturalIds, entry.suite.id, naturalIdSet, onReorderAnnouncement, order, ordered]
  );

  const reorderEnabled = props.order !== undefined;
  const isFocused = props.focusedSuiteId === entry.suite.id;
  const isInFocusedBranch = props.focusedSuiteIds?.has(entry.suite.id) ?? isFocused;
  const isDimmed = props.focusedSuiteId !== null && !isInFocusedBranch;
  const canCollapse = entry.hasChildren || entry.totalProjectionCount > 0;
  const countLabel = entry.visibleBranchProjectionCount === entry.branchProjectionCount
    ? String(entry.branchProjectionCount)
    : `${entry.visibleBranchProjectionCount} / ${entry.branchProjectionCount}`;

  return (
    <li
      className={[
        "relations-view-suite",
        isCollapsed ? "relations-view-suite-collapsed" : "",
        isFocused ? "relations-view-suite-focused" : "",
        isDimmed ? "relations-view-suite-dimmed" : "",
        entry.branchProjectionCount === 0 ? "relations-view-suite-empty" : ""
      ].filter(Boolean).join(" ")}
      style={{ "--suite-depth": entry.suite.depth } as React.CSSProperties}
      data-suite-depth={entry.suite.depth}
    >
      <div className="relations-view-suite-header">
        <button
          type="button"
          className="relations-view-suite-toggle"
          onClick={() => canCollapse && props.collapse.toggle(entry.suite.id)}
          aria-expanded={canCollapse ? !isCollapsed : undefined}
          data-suite-id={entry.suite.id}
          data-parent-suite-id={entry.suite.parentSuiteId ?? undefined}
        >
          <span className="relations-view-suite-toggle-icon" aria-hidden="true">
            {canCollapse ? <ChevronIcon direction={isCollapsed ? "right" : "down"} /> : null}
          </span>
          <span className="relations-view-suite-folder-icon" aria-hidden="true">
            <FolderIcon open={!isCollapsed && entry.hasChildren} />
          </span>
          <span className="relations-view-suite-name" title={entry.suite.path}>
            <HighlightedText text={entry.suite.name} query={props.searchQuery} />
          </span>
        </button>
        {props.onFocusSuite && entry.branchProjectionCount > 0 ? (
          <button
            type="button"
            className="relations-view-suite-focus"
            aria-pressed={isFocused}
            aria-label={`${isFocused ? "Clear focus from" : "Focus"} suite ${entry.suite.name}`}
            title={isFocused ? "Clear suite focus" : "Focus related items"}
            onClick={() => props.onFocusSuite?.(isFocused ? null : entry.suite.id)}
          >
            <FocusIcon />
          </button>
        ) : null}
        {suiteHref ? (
          <a
            className="relations-view-suite-link"
            href={suiteHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Open results page for suite ${entry.suite.name} in Azure DevOps (new tab)`}
            title="Open suite results in Azure DevOps"
          >
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <span className="relations-view-suite-count">{countLabel}</span>
      </div>

      {!isCollapsed && ordered.length > 0 ? (
        <div
          className="relations-view-suite-cards"
          ref={containerRef}
          data-suite-cards=""
          data-suite-id={entry.suite.id}
          onDragOver={reorderEnabled ? handleDragOver : undefined}
          onDragLeave={reorderEnabled ? itemDragging.handleDragLeave : undefined}
          onDrop={reorderEnabled ? handleDrop : undefined}
        >
          {ordered.map((projection) => {
            const rowKey = `${projection.workItemId}::${projection.suiteId}`;
            return (
              <div
                key={rowKey}
                className={props.draggedKey === rowKey
                  ? "relations-view-test-case-row relations-view-test-case-row-dragging"
                  : "relations-view-test-case-row"}
                data-test-case-id={projection.workItemId}
              >
                {reorderEnabled ? (
                  <button
                    type="button"
                    className="relations-view-drag-handle"
                    draggable
                    onDragStart={(event) => props.onDragStart(
                      projection.workItemId,
                      projection.suiteId,
                      event
                    )}
                    onDragEnd={props.onDragEnd}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.preventDefault()}
                    onKeyDown={(event) => handleReorderKeyDown(projection.workItemId, event)}
                    aria-label={`Reorder test case #${projection.workItemId}`}
                    aria-describedby={props.reorderInstructionId}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    title="Drag to reorder, or use Arrow Up and Arrow Down"
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                ) : null}
                <TestCaseCard
                  projection={projection}
                  onLinePointerDown={props.onLinePointerDown}
                  getWorkItemHref={props.getWorkItemHref}
                  highlightQuery={props.searchQuery}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

function readTestCaseId(row: HTMLElement): number | null {
  const id = Number.parseInt(row.dataset.testCaseId ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function FolderIcon(props: { open: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d={props.open
        ? "M3 7.5h7l2 2h9l-2.2 8.5H5.2L3 7.5Z"
        : "M3 6.5h7l2 2h9v9.5H3V6.5Z"} />
    </svg>
  );
}

function FocusIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}
