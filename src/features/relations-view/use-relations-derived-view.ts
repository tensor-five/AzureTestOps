import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { RelationAdjacencyIndex } from "../../domain/relations/snapshot-relation-index.js";
import type {
  TestCaseColumnFilterPreference,
  WorkItemColumnFilterPreference
} from "../../shared/user-preferences/user-preferences.client.js";
import { extractTestCaseFacets, filterTestCases } from "../filters/test-case-filters.js";
import { extractWorkItemFacets, filterWorkItems } from "../filters/work-item-filters.js";
import type { RelationVisibility } from "./relations-view-controls.js";
import {
  buildRelationSummary,
  filterOpenBugs,
  filterProjectionsByRelationVisibility,
  filterWorkItemsByRelationVisibility,
  resolveFocusedWorkItemIds
} from "./relations-view-controls.js";

export function useRelationsDerivedView(options: {
  projections: readonly TestCaseProjection[];
  workItems: readonly WorkItem[];
  testCaseFilter: TestCaseColumnFilterPreference;
  workItemFilter: WorkItemColumnFilterPreference;
  testCaseRelationVisibility: RelationVisibility;
  workItemRelationVisibility: RelationVisibility;
  openBugsOnly: boolean;
  focusedSuiteIds: ReadonlySet<number> | null;
  relationIndex: RelationAdjacencyIndex;
}) {
  const testCaseFacets = React.useMemo(
    () => extractTestCaseFacets(options.projections),
    [options.projections]
  );
  const workItemFacets = React.useMemo(
    () => extractWorkItemFacets(options.workItems),
    [options.workItems]
  );
  const persistedFilteredProjections = React.useMemo(
    () => filterTestCases(options.projections, options.testCaseFilter),
    [options.projections, options.testCaseFilter]
  );
  const persistedFilteredWorkItems = React.useMemo(
    () => filterWorkItems(options.workItems, options.workItemFilter),
    [options.workItems, options.workItemFilter]
  );
  const filteredProjections = React.useMemo(
    () => filterProjectionsByRelationVisibility(
      persistedFilteredProjections,
      options.workItems,
      options.testCaseRelationVisibility,
      options.relationIndex
    ),
    [
      persistedFilteredProjections,
      options.workItems,
      options.testCaseRelationVisibility,
      options.relationIndex
    ]
  );
  const openBugFilteredWorkItems = React.useMemo(
    () => filterOpenBugs(persistedFilteredWorkItems, options.openBugsOnly),
    [persistedFilteredWorkItems, options.openBugsOnly]
  );
  const filteredWorkItems = React.useMemo(
    () => filterWorkItemsByRelationVisibility(
      openBugFilteredWorkItems,
      options.projections,
      options.workItemRelationVisibility,
      options.relationIndex
    ),
    [
      openBugFilteredWorkItems,
      options.projections,
      options.workItemRelationVisibility,
      options.relationIndex
    ]
  );
  const focusedWorkItemIds = React.useMemo(
    () => resolveFocusedWorkItemIds(
      options.focusedSuiteIds,
      options.projections,
      options.workItems,
      options.relationIndex
    ),
    [options.focusedSuiteIds, options.projections, options.workItems, options.relationIndex]
  );
  const summary = React.useMemo(
    () => buildRelationSummary(options.projections, options.workItems, options.relationIndex),
    [options.projections, options.workItems, options.relationIndex]
  );

  return {
    testCaseFacets,
    workItemFacets,
    filteredProjections,
    filteredWorkItems,
    focusedWorkItemIds,
    summary,
    lineProjections: options.focusedSuiteIds === null
      ? filteredProjections
      : filteredProjections.filter((projection) => options.focusedSuiteIds?.has(projection.suiteId)),
    lineWorkItems: options.focusedSuiteIds === null
      ? filteredWorkItems
      : filteredWorkItems.filter((workItem) => focusedWorkItemIds.has(workItem.id))
  };
}
