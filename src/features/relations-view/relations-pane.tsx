import * as React from "react";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import {
  collectSuiteIds,
  findSuiteById
} from "../../domain/test-management/test-suite-tree.js";
import { useSetFilters } from "../filters/use-set-filters.js";
import { TestCaseColumn } from "./test-case-column.js";
import { WorkItemColumn } from "./work-item-column.js";
import { useSuiteCollapse } from "./use-suite-collapse.js";
import { useSuiteDisplayOptions } from "./use-suite-display-options.js";
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
import { useRelationsViewControls } from "./use-relations-view-controls.js";
import { useRelationsDerivedView } from "./use-relations-derived-view.js";
import { useRelationsFilterBars } from "./use-relations-filter-bars.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { useMagicSort, type MagicSortController } from "./use-magic-sort.js";
import { MagicSortAction } from "./magic-sort-action.js";
import { buildSuiteExplorerEntries, selectVisibleSuiteEntries } from "./suite-explorer.js";
import { useMagicSortSpacerOption } from "./use-magic-sort-spacer-option.js";
import { captureMagicSortGeometry } from "./magic-sort-geometry.js";
import { resolveRelationCardFocus } from "./relation-card-focus.js";

const NO_VISIBLE_LINES: ReadonlySet<string> = new Set();

export type RelationsPaneProps = {
  setId: string | null;
  snapshot: ActiveSetSnapshot | null;
  isLoading: boolean;
  error: string | null;
  hasActiveSet: boolean;
  refreshControl: React.ReactNode;
  getWorkItemHref?: (workItemId: number) => string | null;
  getSuiteHref?: (suiteId: number) => string | null;
  onMagicSortControlChange?(control: MagicSortController | null): void;
};

export function RelationsPane(props: RelationsPaneProps): React.ReactElement {
  const collapse = useSuiteCollapse(props.setId);
  const suiteDisplay = useSuiteDisplayOptions(props.setId);
  const workItemOrder = useWorkItemOrder(props.setId);
  const spacerOption = useMagicSortSpacerOption(props.setId);
  const testCaseOrder = useTestCaseOrder(props.setId);
  const filters = useSetFilters(props.setId);
  const viewControls = useRelationsViewControls(props.setId);
  const containerRef = React.useRef<HTMLElement | null>(null);
  const [containerEl, setContainerEl] = React.useState<HTMLElement | null>(null);
  const setContainer = React.useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
    setContainerEl(node);
  }, []);

  const projections = props.snapshot?.projections ?? [];
  const workItems = props.snapshot?.workItemsFromQuery ?? [];
  const snapshotRelations = React.useMemo(
    () => buildSnapshotRelationSet(props.snapshot),
    [props.snapshot]
  );
  const mutations = useRelationMutations({
    snapshotKey: props.snapshot ? `${props.setId ?? ""}::${props.snapshot.loadedAt}` : null,
    snapshotRelations
  });
  const focusedSuite = React.useMemo(() => {
    if (!props.snapshot || viewControls.focusedSuiteId === null) {
      return null;
    }
    return findSuiteById(props.snapshot.suiteTree, viewControls.focusedSuiteId);
  }, [props.snapshot, viewControls.focusedSuiteId]);
  const focusedSuiteIds = React.useMemo(
    () => focusedSuite ? new Set(collectSuiteIds(focusedSuite)) : null,
    [focusedSuite]
  );
  const resolvedCardFocus = React.useMemo(
    () => resolveRelationCardFocus(
      viewControls.focusedCard,
      projections,
      workItems,
      mutations.relationIndex
    ),
    [mutations.relationIndex, projections, viewControls.focusedCard, workItems]
  );
  const cardFocusActive = viewControls.focusedCard !== null;

  React.useEffect(() => {
    if (
      props.snapshot &&
      viewControls.focusedSuiteId !== null &&
      focusedSuite === null
    ) {
      viewControls.setFocusedSuiteId(null);
    }
  }, [focusedSuite, props.snapshot, viewControls.focusedSuiteId, viewControls.setFocusedSuiteId]);

  const derived = useRelationsDerivedView({
    projections,
    workItems,
    testCaseFilter: filters.testCaseFilter,
    workItemFilter: filters.workItemFilter,
    testCaseRelationVisibility: filters.testCaseFilter.relationVisibility ?? "all",
    workItemRelationVisibility: filters.workItemFilter.relationVisibility ?? "all",
    openBugsOnly: filters.workItemFilter.openBugsOnly ?? false,
    focusedSuiteIds,
    relationIndex: mutations.relationIndex
  });
  const filterBars = useRelationsFilterBars({
    filters,
    projections,
    workItems,
    testCaseFacets: derived.testCaseFacets,
    workItemFacets: derived.workItemFacets,
    visibleTestCaseCount: derived.filteredProjections.length,
    visibleWorkItemCount: derived.filteredWorkItems.length,
  });
  const magicSortVisibleRows = React.useMemo(() => {
    if (!props.snapshot) {
      return [];
    }
    const searchQuery = filters.testCaseFilter.titleQuery ?? "";
    const searchActive = searchQuery.trim().length > 0;
    const entries = buildSuiteExplorerEntries(
      props.snapshot.suiteTree,
      derived.filteredProjections,
      projections
    );
    return selectVisibleSuiteEntries(entries, collapse, {
      hideEmptySuites: suiteDisplay.hideEmptySuites,
      searchQuery
    }).flatMap((entry) => {
      const header = { kind: "suite-header" as const, suiteId: entry.suite.id };
      if (!searchActive && collapse.isCollapsed(entry.suite.id)) {
        return [header];
      }
      return [
        header,
        ...testCaseOrder.sortByStoredOrder(entry.suite.id, entry.projections).map((projection) => ({
          kind: "test-case" as const,
          suiteId: entry.suite.id,
          testCaseId: projection.workItemId
        }))
      ];
    });
  }, [
    collapse,
    derived.filteredProjections,
    filters.testCaseFilter.titleQuery,
    projections,
    props.snapshot,
    suiteDisplay.hideEmptySuites,
    testCaseOrder
  ]);
  const magicSortSuites = React.useMemo(() => {
    const visibleIdsBySuite = new Map<number, Set<number>>();
    magicSortVisibleRows.forEach((row) => {
      if (row.kind === "test-case") {
        const ids = visibleIdsBySuite.get(row.suiteId) ?? new Set<number>();
        ids.add(row.testCaseId);
        visibleIdsBySuite.set(row.suiteId, ids);
      }
    });
    return [...visibleIdsBySuite.entries()].map(([suiteId, visibleIds]) => {
      const suiteProjections = derived.filteredProjections.filter((projection) =>
        projection.suiteId === suiteId && visibleIds.has(projection.workItemId)
      );
      return {
        suiteId,
        testCaseIds: testCaseOrder
          .sortByStoredOrder(suiteId, suiteProjections)
          .map((projection) => projection.workItemId),
        naturalIds: projections
          .filter((projection) => projection.suiteId === suiteId)
          .map((projection) => projection.workItemId)
      };
    });
  }, [derived.filteredProjections, magicSortVisibleRows, projections, testCaseOrder]);
  const magicSortWorkItems = React.useMemo(() => {
    const ordered = workItemOrder.sortByStoredOrder(derived.filteredWorkItems);
    if (!spacerOption.addSpacer) {
      return ordered;
    }
    const orderIndex = new Map(ordered.map((workItem, index) => [workItem.id, index]));
    return ordered.slice().sort((left, right) => (
      (spacerOption.workItemPositions[left.id] ?? 0) - (spacerOption.workItemPositions[right.id] ?? 0)
      || (orderIndex.get(left.id) ?? 0) - (orderIndex.get(right.id) ?? 0)
    ));
  }, [derived.filteredWorkItems, spacerOption.addSpacer, spacerOption.workItemPositions, workItemOrder]);
  const magicSortVisibleTestCaseIds = React.useMemo(
    () => new Set(magicSortSuites.flatMap((suite) => suite.testCaseIds)),
    [magicSortSuites]
  );
  const magicSort = useMagicSort({
    input: {
      suites: magicSortSuites.map(({ suiteId, testCaseIds }) => ({ suiteId, testCaseIds })),
      visibleRows: magicSortVisibleRows,
      workItemIds: magicSortWorkItems.map((workItem) => workItem.id),
      addSpacer: spacerOption.addSpacer,
      workItemPositions: Object.fromEntries(magicSortWorkItems.flatMap((workItem) => {
        const position = spacerOption.workItemPositions[workItem.id];
        return position === undefined ? [] : [[workItem.id, position]];
      })),
      workItems: magicSortWorkItems.map((workItem) => ({
        id: workItem.id,
        relatedTestCaseIds: [...(mutations.relationIndex.testCaseIdsByWorkItemId.get(workItem.id) ?? [])]
          .filter((testCaseId) => magicSortVisibleTestCaseIds.has(testCaseId))
      }))
    },
    applyLayout: (layout) => {
      workItemOrder.applyVisibleOrder?.(
        magicSortWorkItems.map((workItem) => workItem.id),
        layout.workItemIds,
        workItems.map((workItem) => workItem.id).sort((a, b) => a - b)
      );
      if (layout.workItemPositions) {
        spacerOption.applyVisiblePositions(magicSortWorkItems.map((workItem) => workItem.id), layout.workItemPositions);
      }
      layout.suites.forEach((suite) => {
        const current = magicSortSuites.find((candidate) => candidate.suiteId === suite.suiteId);
        if (!current) {
          return;
        }
        testCaseOrder.applyVisibleOrder?.(
          suite.suiteId,
          current.testCaseIds,
          suite.testCaseIds,
          current.naturalIds
        );
      });
    },
    captureGeometry: () => captureMagicSortGeometry({
      container: containerRef.current,
      visibleRows: magicSortVisibleRows,
      workItemIds: magicSortWorkItems.map((workItem) => workItem.id)
    })
  });
  const magicSortControl = React.useMemo<MagicSortController>(() => ({
    ...magicSort,
    addSpacer: spacerOption.addSpacer,
    setAddSpacer: spacerOption.setAddSpacer
  }), [magicSort, spacerOption.addSpacer, spacerOption.setAddSpacer]);
  const magicSortAvailable = props.hasActiveSet && props.snapshot !== null && props.error === null;

  React.useEffect(() => {
    props.onMagicSortControlChange?.(magicSortAvailable ? magicSortControl : null);
  }, [
    magicSortControl,
    magicSortAvailable,
    props.onMagicSortControlChange
  ]);
  React.useEffect(() => () => props.onMagicSortControlChange?.(null), [props.onMagicSortControlChange]);

  const drawing = useLineDrawing({
    containerRef,
    enabled: true,
    onConnect: (sourceItemKey, targetItemKey) => {
      const link = resolvePairFromItemKeys(sourceItemKey, targetItemKey);
      if (link) {
        void mutations.addRelation(link.testCaseId, link.workItemId);
      }
    }
  });
  const lines = React.useMemo(
    () => buildLineSpecs(derived.lineProjections, derived.lineWorkItems, {
      relationIndex: mutations.relationIndex,
      isPending: mutations.isPending
    }),
    [
      derived.lineProjections,
      derived.lineWorkItems,
      mutations.relationIndex,
      mutations.isPending
    ]
  );
  const [renderedLineIds, setRenderedLineIds] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );
  const handleVisibleLineIdsChange = React.useCallback((next: ReadonlySet<string>) => {
    setRenderedLineIds((current) => sameStringSet(current, next) ? current : next);
  }, []);
  const selection = useLineSelection({
    enabled: true,
    visibleLineIds:
      props.hasActiveSet && !props.error && props.snapshot
        ? renderedLineIds
        : NO_VISIBLE_LINES,
    onDeleteRequested: (lineId) => {
      const pair = parseLineId(lineId);
      if (pair) {
        void mutations.removeRelation(pair.testCaseId, pair.workItemId);
      }
    }
  });

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
      <RelationsPaneNotice title="Snapshot failed" action={props.refreshControl}>
        <span>{props.error}</span>
        <span>Retry once the Azure DevOps issue is resolved.</span>
      </RelationsPaneNotice>
    );
  }
  if (props.isLoading && !props.snapshot) {
    return (
      <RelationsPaneNotice title="Loading active set…" action={props.refreshControl}>
        Test plans, suites, runs, results and the saved query are streaming in.
      </RelationsPaneNotice>
    );
  }
  if (!props.snapshot) {
    return (
      <RelationsPaneNotice title="No snapshot loaded" action={props.refreshControl}>
        Refresh the active set to load test cases and work items.
      </RelationsPaneNotice>
    );
  }

  const focusedSuiteLabel = focusedSuite?.name ?? null;

  return (
    <div className="relations-workspace">
      <WorkspaceToolbar
        refreshControl={props.refreshControl}
        loadedAt={props.snapshot.loadedAt}
        testCaseCount={props.snapshot.projections.length}
        workItemCount={props.snapshot.workItemsFromQuery.length}
        relationCount={derived.summary.relationCount}
        unlinkedTestCaseCount={derived.summary.unlinkedTestCaseCount}
        unlinkedWorkItemCount={derived.summary.unlinkedWorkItemCount}
        focusedSuiteLabel={focusedSuiteLabel}
        onClearFocus={() => viewControls.setFocusedSuiteId(null)}
        magicSortAction={props.onMagicSortControlChange ? null : (
          <MagicSortAction
            onStart={magicSortControl.start}
            isRunning={magicSortControl.isRunning}
            status={magicSortControl.status}
            progress={magicSortControl.progress}
            feedbackState={magicSortControl.feedbackState}
            addSpacer={magicSortControl.addSpacer}
            onAddSpacerChange={magicSortControl.setAddSpacer}
          />
        )}
        mobileColumn={viewControls.mobileColumn}
        onMobileColumnChange={viewControls.setMobileColumn}
      />
      <section
        className="relations-view"
        ref={setContainer}
        data-mobile-column={viewControls.mobileColumn}
      >
        <TestCaseColumn
          suiteTree={props.snapshot.suiteTree}
          projections={derived.filteredProjections}
          allProjections={props.snapshot.projections}
          unfilteredCount={props.snapshot.projections.length}
          collapse={collapse}
          filterBar={filterBars.testCaseFilterBar}
          onLinePointerDown={drawing.startFromCard}
          order={testCaseOrder}
          getWorkItemHref={props.getWorkItemHref}
          getSuiteHref={props.getSuiteHref}
          searchQuery={filters.testCaseFilter.titleQuery ?? ""}
          hideEmptySuites={suiteDisplay.hideEmptySuites}
          onHideEmptySuitesChange={suiteDisplay.setHideEmptySuites}
          focusedSuiteId={focusedSuite?.id ?? null}
          focusedSuiteIds={focusedSuiteIds ?? undefined}
          onFocusSuite={viewControls.setFocusedSuiteId}
          focusActive={cardFocusActive}
          focusedTestCaseIds={resolvedCardFocus.testCaseIds}
          onFocusTestCase={(workItemId) => viewControls.toggleFocusedCard({ kind: "test-case", workItemId })}
        />
        <WorkItemColumn
          workItems={derived.filteredWorkItems}
          allWorkItems={props.snapshot.workItemsFromQuery}
          unfilteredCount={props.snapshot.workItemsFromQuery.length}
          filterBar={filterBars.workItemFilterBar}
          onLinePointerDown={drawing.startFromCard}
          order={workItemOrder}
          addSpacer={spacerOption.addSpacer}
          workItemPositions={spacerOption.workItemPositions}
          getWorkItemHref={props.getWorkItemHref}
          highlightQuery={filters.workItemFilter.titleQuery ?? ""}
          focusActive={focusedSuite !== null || cardFocusActive}
          focusedWorkItemIds={cardFocusActive ? resolvedCardFocus.workItemIds : derived.focusedWorkItemIds}
          onFocusWorkItem={(workItemId) => viewControls.toggleFocusedCard({ kind: "work-item", workItemId })}
        />
        <RelationLineLayer
          container={containerEl}
          lines={lines}
          draft={drawing.draft}
          selectedLineId={selection.selectedLineId}
          onSelectLine={selection.selectLine}
          onVisibleLineIdsChange={handleVisibleLineIdsChange}
          layoutVersion={[
            [...collapse.collapsedSuiteIds].sort().join(","),
            derived.filteredProjections.length,
            derived.filteredWorkItems.length,
            testCaseOrder.layoutRevision,
            workItemOrder.layoutRevision,
            viewControls.mobileColumn
          ].join(":")}
          focusActive={cardFocusActive}
          focusedRelationKeys={resolvedCardFocus.relationKeys}
        />
        {mutations.error ? (
          <RelationErrorBanner message={mutations.error} onDismiss={mutations.clearError} />
        ) : null}
      </section>
    </div>
  );
}

function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function RelationsPaneNotice(props: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ui-shell-placeholder">
      <h2>{props.title}</h2>
      <div className="relations-view-notice-body">{props.children}</div>
      {props.action ? <div className="relations-view-notice-actions">{props.action}</div> : null}
    </div>
  );
}

function RelationErrorBanner(props: { message: string; onDismiss(): void }): React.ReactElement {
  return (
    <div className="relations-view-error-banner" role="alert">
      <span>{props.message}</span>
      <button type="button" className="u-btn relations-view-error-banner-dismiss" onClick={props.onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
