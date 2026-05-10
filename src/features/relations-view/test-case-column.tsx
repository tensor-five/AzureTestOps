import * as React from "react";

import {
  flattenSuiteTree,
  type TestSuiteFlatEntry,
  type TestSuiteNode
} from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { TestCaseCard } from "./test-case-card.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";
import type { TestCaseOrderApi } from "./use-test-case-order.js";

const DRAG_DATA_TYPE = "application/x-azure-testops-test-case";
const DRAG_DROP_EDGE_ATTR = "data-drop-edge";

export type TestCaseColumnProps = {
  suiteTree: TestSuiteNode;
  /**
   * Already filtered by the active filter bar. The unfiltered total is
   * passed separately so the empty-state copy can distinguish "no test cases
   * in the set" from "no matches for the active filter".
   */
  projections: readonly TestCaseProjection[];
  unfilteredCount: number;
  collapse: SuiteCollapseApi;
  filterBar?: React.ReactNode;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  /** Persists the drag-and-drop ordering per (Set, Suite); absent → fixed title sort. */
  order?: TestCaseOrderApi;
  /** Resolves the Azure DevOps deep link for a work item id, or null if unavailable. */
  getWorkItemHref?: (workItemId: number) => string | null;
};

type SuiteWithProjections = {
  suite: TestSuiteFlatEntry;
  projections: TestCaseProjection[];
};

type DragSource = { workItemId: number; suiteId: number };

/** Collapsing a parent suite hides every descendant suite, not just its row. */
export function TestCaseColumn(props: TestCaseColumnProps): React.ReactElement {
  const grouped = React.useMemo(
    () => groupProjectionsBySuite(props.suiteTree, props.projections),
    [props.suiteTree, props.projections]
  );

  const visibleEntries = React.useMemo(
    () => filterVisibleSuites(grouped, props.collapse),
    [grouped, props.collapse]
  );

  const visibleProjectionCount = props.projections.length;
  const unfilteredCount = props.unfilteredCount;
  const order = props.order;

  const dragSourceRef = React.useRef<DragSource | null>(null);
  const [draggedKey, setDraggedKey] = React.useState<string | null>(null);

  const beginDrag = React.useCallback(
    (
      workItemId: number,
      suiteId: number,
      event: React.DragEvent<HTMLElement>
    ) => {
      if (!order) {
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
    [order]
  );

  const endDrag = React.useCallback(() => {
    dragSourceRef.current = null;
    setDraggedKey(null);
    document
      .querySelectorAll(`[data-suite-cards] [${DRAG_DROP_EDGE_ATTR}]`)
      .forEach((el) => el.removeAttribute(DRAG_DROP_EDGE_ATTR));
  }, []);

  return (
    <section className="relations-view-column relations-view-column-test-cases" aria-label="Test cases">
      <header className="relations-view-column-header">
        <h3>Test Cases</h3>
        <span className="relations-view-column-count">
          {visibleProjectionCount === unfilteredCount
            ? unfilteredCount
            : `${visibleProjectionCount} / ${unfilteredCount}`}
        </span>
      </header>
      {props.filterBar}
      {unfilteredCount === 0 ? (
        <p className="relations-view-column-empty">No test cases in this set.</p>
      ) : visibleProjectionCount === 0 ? (
        <p className="relations-view-column-empty">No test cases match the active filter.</p>
      ) : visibleEntries.length === 0 ? (
        <p className="relations-view-column-empty">All suites are collapsed.</p>
      ) : (
        <ol className="relations-view-suite-list">
          {visibleEntries.map((entry) => (
            <SuiteGroup
              key={entry.suite.id}
              entry={entry}
              collapse={props.collapse}
              onLinePointerDown={props.onLinePointerDown}
              getWorkItemHref={props.getWorkItemHref}
              order={order}
              dragSourceRef={dragSourceRef}
              draggedKey={draggedKey}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SuiteGroup(props: {
  entry: SuiteWithProjections;
  collapse: SuiteCollapseApi;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  getWorkItemHref?: (workItemId: number) => string | null;
  order?: TestCaseOrderApi;
  dragSourceRef: React.MutableRefObject<DragSource | null>;
  draggedKey: string | null;
  onDragStart: (
    workItemId: number,
    suiteId: number,
    event: React.DragEvent<HTMLElement>
  ) => void;
  onDragEnd: () => void;
}): React.ReactElement {
  const { entry, collapse, order, dragSourceRef, onDragEnd, onDragStart, draggedKey } = props;
  const isCollapsed = collapse.isCollapsed(entry.suite.id);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const ordered = React.useMemo(() => {
    if (!order) {
      return entry.projections;
    }
    return order.sortByStoredOrder(entry.suite.id, entry.projections);
  }, [order, entry.projections, entry.suite.id]);

  const resolveDropTarget = React.useCallback(
    (clientY: number): { workItemId: number; edge: "before" | "after"; element: HTMLElement } | null => {
      const container = containerRef.current;
      if (!container) {
        return null;
      }
      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(":scope > [data-test-case-id]")
      );
      if (rows.length === 0) {
        return null;
      }
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (clientY < midpoint) {
          const id = Number.parseInt(row.dataset.testCaseId ?? "", 10);
          if (!Number.isFinite(id)) {
            return null;
          }
          return { workItemId: id, edge: "before", element: row };
        }
      }
      const last = rows[rows.length - 1];
      const id = Number.parseInt(last.dataset.testCaseId ?? "", 10);
      if (!Number.isFinite(id)) {
        return null;
      }
      return { workItemId: id, edge: "after", element: last };
    },
    []
  );

  const clearEdges = React.useCallback(() => {
    containerRef.current
      ?.querySelectorAll(`[${DRAG_DROP_EDGE_ATTR}]`)
      .forEach((el) => el.removeAttribute(DRAG_DROP_EDGE_ATTR));
  }, []);

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!order) {
        return;
      }
      const source = dragSourceRef.current;
      if (!source || source.suiteId !== entry.suite.id) {
        // Cross-suite drops are not supported — withhold preventDefault so
        // the browser's "no drop" cursor signals the rejection.
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = resolveDropTarget(event.clientY);
      if (!target) {
        return;
      }
      const container = containerRef.current;
      container?.querySelectorAll(`[${DRAG_DROP_EDGE_ATTR}]`).forEach((el) => {
        if (el !== target.element) {
          el.removeAttribute(DRAG_DROP_EDGE_ATTR);
        }
      });
      if (target.element.getAttribute(DRAG_DROP_EDGE_ATTR) !== target.edge) {
        target.element.setAttribute(DRAG_DROP_EDGE_ATTR, target.edge);
      }
    },
    [order, dragSourceRef, entry.suite.id, resolveDropTarget]
  );

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) {
        return;
      }
      clearEdges();
    },
    [clearEdges]
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!order) {
        return;
      }
      const source = dragSourceRef.current;
      if (!source || source.suiteId !== entry.suite.id) {
        return;
      }
      event.preventDefault();
      const target = resolveDropTarget(event.clientY);
      if (!target || target.workItemId === source.workItemId) {
        onDragEnd();
        return;
      }
      order.move(entry.suite.id, source.workItemId, target.workItemId, target.edge);
      onDragEnd();
    },
    [order, dragSourceRef, entry.suite.id, resolveDropTarget, onDragEnd]
  );

  const reorderEnabled = order !== undefined;

  return (
    <li
      className={`relations-view-suite ${isCollapsed ? "relations-view-suite-collapsed" : ""}`}
      style={{ "--suite-depth": entry.suite.depth } as React.CSSProperties}
    >
      <button
        type="button"
        className="relations-view-suite-toggle"
        onClick={() => collapse.toggle(entry.suite.id)}
        aria-expanded={!isCollapsed}
      >
        <span className="relations-view-suite-toggle-icon" aria-hidden>
          {isCollapsed ? "▸" : "▾"}
        </span>
        <span className="relations-view-suite-name" title={entry.suite.path}>
          {entry.suite.name}
        </span>
        <span className="relations-view-suite-count">{entry.projections.length}</span>
      </button>
      {!isCollapsed && ordered.length > 0 ? (
        <div
          className="relations-view-suite-cards"
          ref={containerRef}
          data-suite-cards=""
          data-suite-id={entry.suite.id}
          onDragOver={reorderEnabled ? handleDragOver : undefined}
          onDragLeave={reorderEnabled ? handleDragLeave : undefined}
          onDrop={reorderEnabled ? handleDrop : undefined}
        >
          {ordered.map((projection) => {
            const rowKey = `${projection.workItemId}::${projection.suiteId}`;
            const className =
              draggedKey === rowKey
                ? "relations-view-test-case-row relations-view-test-case-row-dragging"
                : "relations-view-test-case-row";
            return (
              <div
                key={rowKey}
                className={className}
                data-test-case-id={projection.workItemId}
              >
                {reorderEnabled ? (
                  <button
                    type="button"
                    className="relations-view-drag-handle"
                    draggable
                    onDragStart={(event) =>
                      onDragStart(projection.workItemId, projection.suiteId, event)
                    }
                    onDragEnd={onDragEnd}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.preventDefault()}
                    aria-label={`Reorder test case #${projection.workItemId}`}
                    title="Drag to reorder"
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                ) : null}
                <TestCaseCard
                  projection={projection}
                  onLinePointerDown={props.onLinePointerDown}
                  getWorkItemHref={props.getWorkItemHref}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

function groupProjectionsBySuite(
  tree: TestSuiteNode,
  projections: readonly TestCaseProjection[]
): SuiteWithProjections[] {
  const flat = flattenSuiteTree(tree);
  const bySuite = new Map<number, TestCaseProjection[]>();

  for (const projection of projections) {
    const list = bySuite.get(projection.suiteId);
    if (list) {
      list.push(projection);
    } else {
      bySuite.set(projection.suiteId, [projection]);
    }
  }

  return flat.map((suite) => ({
    suite,
    projections: (bySuite.get(suite.id) ?? []).slice().sort(compareProjections)
  }));
}

function compareProjections(a: TestCaseProjection, b: TestCaseProjection): number {
  if (a.title === b.title) {
    return a.workItemId - b.workItemId;
  }
  return a.title.localeCompare(b.title);
}

/**
 * If a suite is collapsed, its descendants in the flat list are skipped.
 * Walks `flat` once and tracks the depth of the deepest active collapse;
 * everything strictly deeper is filtered out until the depth recovers.
 */
function filterVisibleSuites(
  entries: SuiteWithProjections[],
  collapse: SuiteCollapseApi
): SuiteWithProjections[] {
  const visible: SuiteWithProjections[] = [];
  let collapseDepth: number | null = null;

  for (const entry of entries) {
    if (collapseDepth !== null && entry.suite.depth > collapseDepth) {
      continue;
    }
    collapseDepth = null;
    visible.push(entry);
    if (collapse.isCollapsed(entry.suite.id)) {
      collapseDepth = entry.suite.depth;
    }
  }

  return visible;
}
