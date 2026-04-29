import * as React from "react";

import type { ActiveSetSnapshot } from "../../domain/sets/set.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import {
  FilterBar,
  toggleStringList,
  type FilterFacet,
  type FilterFacetKind
} from "../filters/filter-bar.js";
import {
  extractTestCaseFacets,
  filterTestCases
} from "../filters/test-case-filters.js";
import {
  extractWorkItemFacets,
  filterWorkItems
} from "../filters/work-item-filters.js";
import { useSetFilters } from "../filters/use-set-filters.js";
import type { RelationsViewMode } from "./mode.js";
import { TestCaseColumn } from "./test-case-column.js";
import { WorkItemColumn } from "./work-item-column.js";
import { useItemPositioning } from "./use-item-positioning.js";
import { useSuiteCollapse } from "./use-suite-collapse.js";
import { useRelationMutations } from "./use-relation-mutations.js";
import { useLineDrawing } from "./use-line-drawing.js";
import { useLineSelection } from "./use-line-selection.js";
import {
  RelationLineLayer,
  type LineSpec
} from "./relation-line-layer.js";
import {
  parseItemKey,
  testCaseItemKey,
  workItemItemKey
} from "./item-key.js";

export type RelationsPaneProps = {
  setId: string | null;
  snapshot: ActiveSetSnapshot | null;
  mode: RelationsViewMode;
  isLoading: boolean;
  error: string | null;
  hasActiveSet: boolean;
};

const LINE_ID_SEPARATOR = "->";

export function RelationsPane(props: RelationsPaneProps): React.ReactElement {
  const positioning = useItemPositioning(props.setId, props.mode === "move-items");
  const collapse = useSuiteCollapse(props.setId);
  const filters = useSetFilters(props.setId);
  const containerRef = React.useRef<HTMLElement | null>(null);

  const projections = props.snapshot?.projections ?? [];
  const workItems = props.snapshot?.workItemsFromQuery ?? [];

  const testCaseFacets = React.useMemo(
    () => extractTestCaseFacets(projections),
    [projections]
  );
  const workItemFacets = React.useMemo(
    () => extractWorkItemFacets(workItems),
    [workItems]
  );

  const filteredProjections = React.useMemo(
    () => filterTestCases(projections, filters.testCaseFilter),
    [projections, filters.testCaseFilter]
  );
  const filteredWorkItems = React.useMemo(
    () => filterWorkItems(workItems, filters.workItemFilter),
    [workItems, filters.workItemFilter]
  );

  const snapshotRelations = React.useMemo(
    () => buildSnapshotRelationSet(props.snapshot),
    [props.snapshot]
  );

  const isRelatedInSnapshot = React.useCallback(
    (testCaseId: number, workItemId: number): boolean =>
      snapshotRelations.has(`${testCaseId}::${workItemId}`),
    [snapshotRelations]
  );

  const snapshotKey = props.snapshot
    ? `${props.setId ?? ""}::${props.snapshot.loadedAt}`
    : null;

  const mutations = useRelationMutations({
    snapshotKey,
    isRelatedInSnapshot
  });

  const drawing = useLineDrawing({
    containerRef,
    enabled: props.mode === "edit-relations",
    onConnect: (sourceItemKey, targetItemKey) => {
      const link = resolvePairFromItemKeys(sourceItemKey, targetItemKey);
      if (!link) {
        return;
      }
      void mutations.addRelation(link.testCaseId, link.workItemId);
    }
  });

  const selection = useLineSelection({
    enabled: props.mode === "edit-relations",
    onDeleteRequested: (lineId) => {
      const pair = parseLineId(lineId);
      if (!pair) {
        return;
      }
      void mutations.removeRelation(pair.testCaseId, pair.workItemId);
    }
  });

  React.useEffect(() => {
    if (props.mode !== "edit-relations") {
      selection.clearSelection();
    }
  }, [props.mode, selection]);

  const lines = React.useMemo(
    () => buildLineSpecs(filteredProjections, filteredWorkItems, mutations),
    [filteredProjections, filteredWorkItems, mutations]
  );

  const handleToggleTestCaseFacet = React.useCallback(
    (kind: FilterFacetKind, value: string) => {
      const current = filters.testCaseFilter;
      const previousList = readListForKind(current, kind);
      const nextList = toggleStringList(previousList, value);
      filters.setTestCaseFilter({
        ...current,
        [kind]: nextList.length > 0 ? nextList : undefined
      });
    },
    [filters]
  );

  const handleToggleWorkItemFacet = React.useCallback(
    (kind: FilterFacetKind, value: string) => {
      if (kind === "lastOutcomes") {
        return;
      }
      const current = filters.workItemFilter;
      const previousList = readListForKind(current, kind);
      const nextList = toggleStringList(previousList, value);
      filters.setWorkItemFilter({
        ...current,
        [kind]: nextList.length > 0 ? nextList : undefined
      });
    },
    [filters]
  );

  const handleTestCaseTitleChange = React.useCallback(
    (next: string) => {
      filters.setTestCaseFilter({
        ...filters.testCaseFilter,
        titleQuery: next.length > 0 ? next : undefined
      });
    },
    [filters]
  );

  const handleWorkItemTitleChange = React.useCallback(
    (next: string) => {
      filters.setWorkItemFilter({
        ...filters.workItemFilter,
        titleQuery: next.length > 0 ? next : undefined
      });
    },
    [filters]
  );

  if (!props.hasActiveSet) {
    return (
      <RelationsPaneNotice title="Select or create a set">
        Open the set dropdown in the header and pick an active set, or use “Manage sets…” to
        configure your first one.
      </RelationsPaneNotice>
    );
  }

  if (props.error) {
    return (
      <RelationsPaneNotice title="Snapshot failed">
        <span>{props.error}</span>
        <span>Use the Refresh button to retry once the issue is resolved.</span>
      </RelationsPaneNotice>
    );
  }

  if (props.isLoading && !props.snapshot) {
    return (
      <RelationsPaneNotice title="Loading active set…">
        Test plans, suites, runs, results and the saved query are streaming in.
      </RelationsPaneNotice>
    );
  }

  if (!props.snapshot) {
    return (
      <RelationsPaneNotice title="No snapshot loaded">
        Click Refresh to load the active set.
      </RelationsPaneNotice>
    );
  }

  const { snapshot } = props;
  const editEnabled = props.mode === "edit-relations";
  const editPointerDown = editEnabled ? drawing.startFromCard : undefined;
  const positionsVersion = countPositions(positioning.positions);

  const testCaseFilterFacets = buildTestCaseFacets(testCaseFacets, filters.testCaseFilter);
  const workItemFilterFacets = buildWorkItemFacets(workItemFacets, filters.workItemFilter);

  const testCaseFilterBar = (
    <FilterBar
      ariaLabel="Test cases"
      titleQuery={filters.testCaseFilter.titleQuery ?? ""}
      onTitleQueryChange={handleTestCaseTitleChange}
      facets={testCaseFilterFacets}
      onToggleFacetValue={handleToggleTestCaseFacet}
      onClear={filters.clearTestCaseFilter}
    />
  );
  const workItemFilterBar = (
    <FilterBar
      ariaLabel="Work items"
      titleQuery={filters.workItemFilter.titleQuery ?? ""}
      onTitleQueryChange={handleWorkItemTitleChange}
      facets={workItemFilterFacets}
      onToggleFacetValue={handleToggleWorkItemFacet}
      onClear={filters.clearWorkItemFilter}
    />
  );

  return (
    <section
      className="relations-view"
      data-mode={props.mode}
      ref={(node) => {
        containerRef.current = node;
      }}
    >
      <TestCaseColumn
        suiteTree={snapshot.suiteTree}
        projections={filteredProjections}
        unfilteredCount={snapshot.projections.length}
        positioning={positioning}
        collapse={collapse}
        filterBar={testCaseFilterBar}
        onEditPointerDown={editPointerDown}
      />
      <WorkItemColumn
        workItems={filteredWorkItems}
        unfilteredCount={snapshot.workItemsFromQuery.length}
        positioning={positioning}
        filterBar={workItemFilterBar}
        onEditPointerDown={editPointerDown}
      />
      <RelationLineLayer
        containerRef={containerRef}
        lines={lines}
        draft={drawing.draft}
        selectedLineId={selection.selectedLineId}
        onSelectLine={selection.selectLine}
        layoutVersion={positionsVersion}
      />
      {mutations.error ? (
        <RelationErrorBanner message={mutations.error} onDismiss={mutations.clearError} />
      ) : null}
    </section>
  );
}

function buildTestCaseFacets(
  facets: ReturnType<typeof extractTestCaseFacets>,
  filter: ReturnType<typeof useSetFilters>["testCaseFilter"]
): FilterFacet[] {
  return [
    {
      kind: "lastOutcomes",
      label: "Outcome",
      options: facets.lastOutcomes,
      selected: filter.lastOutcomes ?? []
    },
    {
      kind: "states",
      label: "State",
      options: facets.states,
      selected: filter.states ?? []
    },
    {
      kind: "assignedTo",
      label: "Assigned to",
      options: facets.assignedTo,
      selected: filter.assignedTo ?? []
    },
    {
      kind: "tags",
      label: "Tags",
      options: facets.tags,
      selected: filter.tags ?? []
    },
    {
      kind: "workItemTypes",
      label: "Type",
      options: facets.workItemTypes,
      selected: filter.workItemTypes ?? []
    }
  ];
}

function buildWorkItemFacets(
  facets: ReturnType<typeof extractWorkItemFacets>,
  filter: ReturnType<typeof useSetFilters>["workItemFilter"]
): FilterFacet[] {
  return [
    {
      kind: "states",
      label: "State",
      options: facets.states,
      selected: filter.states ?? []
    },
    {
      kind: "assignedTo",
      label: "Assigned to",
      options: facets.assignedTo,
      selected: filter.assignedTo ?? []
    },
    {
      kind: "tags",
      label: "Tags",
      options: facets.tags,
      selected: filter.tags ?? []
    },
    {
      kind: "workItemTypes",
      label: "Type",
      options: facets.workItemTypes,
      selected: filter.workItemTypes ?? []
    }
  ];
}

function readListForKind(
  filter:
    | ReturnType<typeof useSetFilters>["testCaseFilter"]
    | ReturnType<typeof useSetFilters>["workItemFilter"],
  kind: FilterFacetKind
): readonly string[] | undefined {
  return (filter as Record<string, readonly string[] | undefined>)[kind];
}

function RelationsPaneNotice(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ui-shell-placeholder">
      <h2>{props.title}</h2>
      <div className="relations-view-notice-body">{props.children}</div>
    </div>
  );
}

function RelationErrorBanner(props: {
  message: string;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <div className="relations-view-error-banner" role="alert">
      <span>{props.message}</span>
      <button type="button" className="u-btn relations-view-error-banner-dismiss" onClick={props.onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function buildSnapshotRelationSet(snapshot: ActiveSetSnapshot | null): Set<string> {
  const set = new Set<string>();
  if (!snapshot) {
    return set;
  }
  const workItemIdsInQuery = new Set<number>();
  for (const wi of snapshot.workItemsFromQuery) {
    workItemIdsInQuery.add(wi.id);
  }
  const testCaseIdsInProjections = new Set<number>();
  for (const projection of snapshot.projections) {
    testCaseIdsInProjections.add(projection.workItemId);
  }

  // System.LinkTypes.Related is symmetric in Azure DevOps — both work items
  // mirror the link in their `relations[]`. We walk both sides to be robust
  // against partial data (e.g. older work items that lost the inverse).
  for (const projection of snapshot.projections) {
    for (const relatedId of projection.relatedIds) {
      if (workItemIdsInQuery.has(relatedId)) {
        set.add(`${projection.workItemId}::${relatedId}`);
      }
    }
  }
  for (const wi of snapshot.workItemsFromQuery) {
    for (const relatedId of wi.relatedIds) {
      if (testCaseIdsInProjections.has(relatedId)) {
        set.add(`${relatedId}::${wi.id}`);
      }
    }
  }
  return set;
}

function buildLineSpecs(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  mutations: ReturnType<typeof useRelationMutations>
): LineSpec[] {
  // Lines render only for endpoints that survive the active filter — a
  // hidden endpoint would leave a line floating into nothing, so we anchor
  // both sides to what's actually on screen.
  const workItemIds = workItems.map((wi) => wi.id);
  const seenLineIds = new Set<string>();
  const out: LineSpec[] = [];

  for (const projection of projections) {
    const tcKey = testCaseItemKey(projection.workItemId, projection.suiteId);
    for (const wiId of workItemIds) {
      if (!mutations.isRelated(projection.workItemId, wiId)) {
        continue;
      }
      const wiKey = workItemItemKey(wiId);
      const lineId = `${tcKey}${LINE_ID_SEPARATOR}${wiKey}`;
      if (seenLineIds.has(lineId)) {
        continue;
      }
      seenLineIds.add(lineId);
      out.push({
        lineId,
        testCaseItemKey: tcKey,
        workItemItemKey: wiKey,
        testCaseWorkItemId: projection.workItemId,
        workItemWorkItemId: wiId,
        pending: mutations.isPending(projection.workItemId, wiId)
      });
    }
  }

  return out;
}

function resolvePairFromItemKeys(
  a: string,
  b: string
): { testCaseId: number; workItemId: number } | null {
  const parsedA = parseItemKey(a);
  const parsedB = parseItemKey(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  if (parsedA.kind === "test-case" && parsedB.kind === "work-item") {
    return { testCaseId: parsedA.workItemId, workItemId: parsedB.workItemId };
  }
  if (parsedA.kind === "work-item" && parsedB.kind === "test-case") {
    return { testCaseId: parsedB.workItemId, workItemId: parsedA.workItemId };
  }
  return null;
}

function parseLineId(lineId: string): { testCaseId: number; workItemId: number } | null {
  const [left, right] = lineId.split(LINE_ID_SEPARATOR);
  if (!left || !right) {
    return null;
  }
  return resolvePairFromItemKeys(left, right);
}

function countPositions(positions: Readonly<Record<string, unknown>>): number {
  // A change in offset count is the cheapest signal that the layout shifted;
  // value comparisons are unnecessary because the SVG also recomputes on
  // ResizeObserver events fired by each card's `transform` style change.
  return Object.keys(positions).length;
}
