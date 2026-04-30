import * as React from "react";

import {
  flattenSuiteTree,
  type TestSuiteFlatEntry,
  type TestSuiteNode
} from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { TestCaseCard } from "./test-case-card.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";

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
};

type SuiteWithProjections = {
  suite: TestSuiteFlatEntry;
  projections: TestCaseProjection[];
};

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
}): React.ReactElement {
  const { entry, collapse } = props;
  const isCollapsed = collapse.isCollapsed(entry.suite.id);

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
      {!isCollapsed && entry.projections.length > 0 ? (
        <div className="relations-view-suite-cards">
          {entry.projections.map((projection) => (
            <TestCaseCard
              key={`${projection.workItemId}::${projection.suiteId}`}
              projection={projection}
              onLinePointerDown={props.onLinePointerDown}
            />
          ))}
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
