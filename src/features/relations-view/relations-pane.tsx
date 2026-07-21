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
};

export function RelationsPane(props: RelationsPaneProps): React.ReactElement {
  const collapse = useSuiteCollapse(props.setId);
  const suiteDisplay = useSuiteDisplayOptions(props.setId);
  const workItemOrder = useWorkItemOrder(props.setId);
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
        />
        <WorkItemColumn
          workItems={derived.filteredWorkItems}
          allWorkItems={props.snapshot.workItemsFromQuery}
          unfilteredCount={props.snapshot.workItemsFromQuery.length}
          filterBar={filterBars.workItemFilterBar}
          onLinePointerDown={drawing.startFromCard}
          order={workItemOrder}
          getWorkItemHref={props.getWorkItemHref}
          highlightQuery={filters.workItemFilter.titleQuery ?? ""}
          focusActive={focusedSuite !== null}
          focusedWorkItemIds={derived.focusedWorkItemIds}
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
