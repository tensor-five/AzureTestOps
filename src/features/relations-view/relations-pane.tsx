import * as React from "react";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import { buildWorkItemUrl } from "../../shared/azure-devops/azure-rest-client.js";
import { useAdoContext } from "../set-management/use-ado-context.js";
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
import { TestCaseColumn } from "./test-case-column.js";
import { WorkItemColumn } from "./work-item-column.js";
import { useSuiteCollapse } from "./use-suite-collapse.js";
import { useWorkItemOrder } from "./use-work-item-order.js";
import { useTestCaseOrder } from "./use-test-case-order.js";
import { useRelationMutations } from "./use-relation-mutations.js";
import { useLineDrawing } from "./use-line-drawing.js";
import { useLineSelection } from "./use-line-selection.js";
import { RelationLineLayer } from "./relation-line-layer.js";
import {
  buildLineSpecs,
  buildSnapshotRelationSet,
  parseLineId,
  resolvePairFromItemKeys
} from "./relation-line-specs.js";

export type RelationsPaneProps = {
  setId: string | null;
  snapshot: ActiveSetSnapshot | null;
  isLoading: boolean;
  error: string | null;
  hasActiveSet: boolean;
};

export function RelationsPane(props: RelationsPaneProps): React.ReactElement {
  const collapse = useSuiteCollapse(props.setId);
  const workItemOrder = useWorkItemOrder(props.setId);
  const testCaseOrder = useTestCaseOrder(props.setId);
  const filters = useSetFilters(props.setId);
  const adoContextState = useAdoContext();
  const adoContext = adoContextState.context;
  const getWorkItemHref = React.useMemo<((workItemId: number) => string | null) | undefined>(
    () =>
      adoContext
        ? (workItemId: number) => buildWorkItemUrl(adoContext, workItemId)
        : undefined,
    [adoContext]
  );
  // Container is held as both a ref (for `useLineDrawing`, which reads it
  // lazily on pointer events) and as state (for the line layer, whose
  // initial-mount layout effect would otherwise fire before the section's
  // ref callback). The single callback ref below keeps both in sync.
  const containerRef = React.useRef<HTMLElement | null>(null);
  const [containerEl, setContainerEl] = React.useState<HTMLElement | null>(null);
  const setContainer = React.useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
    setContainerEl(node);
  }, []);

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
    enabled: true,
    onConnect: (sourceItemKey, targetItemKey) => {
      const link = resolvePairFromItemKeys(sourceItemKey, targetItemKey);
      if (!link) {
        return;
      }
      void mutations.addRelation(link.testCaseId, link.workItemId);
    }
  });

  const selection = useLineSelection({
    enabled: true,
    onDeleteRequested: (lineId) => {
      const pair = parseLineId(lineId);
      if (!pair) {
        return;
      }
      void mutations.removeRelation(pair.testCaseId, pair.workItemId);
    }
  });

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
      ref={setContainer}
    >
      <TestCaseColumn
        suiteTree={snapshot.suiteTree}
        projections={filteredProjections}
        unfilteredCount={snapshot.projections.length}
        collapse={collapse}
        filterBar={testCaseFilterBar}
        onLinePointerDown={drawing.startFromCard}
        order={testCaseOrder}
        getWorkItemHref={getWorkItemHref}
      />
      <WorkItemColumn
        workItems={filteredWorkItems}
        unfilteredCount={snapshot.workItemsFromQuery.length}
        filterBar={workItemFilterBar}
        onLinePointerDown={drawing.startFromCard}
        order={workItemOrder}
        getWorkItemHref={getWorkItemHref}
      />
      <RelationLineLayer
        container={containerEl}
        lines={lines}
        draft={drawing.draft}
        selectedLineId={selection.selectedLineId}
        onSelectLine={selection.selectLine}
        layoutVersion={collapse.collapsedSuiteIds.size}
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
