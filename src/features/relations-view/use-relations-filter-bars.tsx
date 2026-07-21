import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import {
  FilterBar,
  toggleStringList,
  type FilterFacet,
  type FilterFacetKind
} from "../filters/filter-bar.js";
import { buildFacetOptions } from "../filters/facet-options.js";
import type { extractTestCaseFacets } from "../filters/test-case-filters.js";
import type { extractWorkItemFacets } from "../filters/work-item-filters.js";
import type { SetFiltersApi } from "../filters/use-set-filters.js";
import type { RelationVisibility } from "./relations-view-controls.js";

export function useRelationsFilterBars(options: {
  filters: SetFiltersApi;
  projections: readonly TestCaseProjection[];
  workItems: readonly WorkItem[];
  testCaseFacets: ReturnType<typeof extractTestCaseFacets>;
  workItemFacets: ReturnType<typeof extractWorkItemFacets>;
  visibleTestCaseCount: number;
  visibleWorkItemCount: number;
}): { testCaseFilterBar: React.ReactElement; workItemFilterBar: React.ReactElement } {
  const { filters } = options;
  const toggleTestCaseFacet = React.useCallback(
    (kind: FilterFacetKind, value: string) => {
      const current = filters.testCaseFilter;
      const nextList = toggleStringList(readListForKind(current, kind), value);
      filters.setTestCaseFilter({
        ...current,
        [kind]: nextList.length > 0 ? nextList : undefined
      });
    },
    [filters]
  );
  const replaceTestCaseFacet = React.useCallback(
    (kind: FilterFacetKind, values: readonly string[]) => {
      filters.setTestCaseFilter({
        ...filters.testCaseFilter,
        [kind]: values.length > 0 ? [...values] : undefined
      });
    },
    [filters]
  );
  const toggleWorkItemFacet = React.useCallback(
    (kind: FilterFacetKind, value: string) => {
      if (kind === "lastOutcomes") {
        return;
      }
      const current = filters.workItemFilter;
      const nextList = toggleStringList(readListForKind(current, kind), value);
      filters.setWorkItemFilter({
        ...current,
        [kind]: nextList.length > 0 ? nextList : undefined
      });
    },
    [filters]
  );
  const replaceWorkItemFacet = React.useCallback(
    (kind: FilterFacetKind, values: readonly string[]) => {
      if (kind === "lastOutcomes") {
        return;
      }
      filters.setWorkItemFilter({
        ...filters.workItemFilter,
        [kind]: values.length > 0 ? [...values] : undefined
      });
    },
    [filters]
  );
  const clearTestCaseFilters = React.useCallback(() => {
    filters.clearTestCaseFilter();
  }, [filters]);
  const clearWorkItemFilters = React.useCallback(() => {
    filters.clearWorkItemFilter();
  }, [filters]);

  const setTestCaseRelationVisibility = React.useCallback(
    (next: RelationVisibility) => filters.setTestCaseFilter({
      ...filters.testCaseFilter,
      relationVisibility: next === "all" ? undefined : next
    }),
    [filters]
  );
  const setWorkItemRelationVisibility = React.useCallback(
    (next: RelationVisibility) => filters.setWorkItemFilter({
      ...filters.workItemFilter,
      relationVisibility: next === "all" ? undefined : next
    }),
    [filters]
  );
  const setOpenBugsOnly = React.useCallback(
    (next: boolean) => filters.setWorkItemFilter({
      ...filters.workItemFilter,
      openBugsOnly: next ? true : undefined
    }),
    [filters]
  );

  const testCaseRelationVisibility = filters.testCaseFilter.relationVisibility ?? "all";
  const workItemRelationVisibility = filters.workItemFilter.relationVisibility ?? "all";
  const openBugsOnly = filters.workItemFilter.openBugsOnly ?? false;

  const testCaseFilterFacets = buildTestCaseFacets(
    options.testCaseFacets,
    filters.testCaseFilter,
    options.projections
  );
  const workItemFilterFacets = buildWorkItemFacets(
    options.workItemFacets,
    filters.workItemFilter,
    options.workItems
  );

  return {
    testCaseFilterBar: (
      <FilterBar
        ariaLabel="Test cases"
        titleQuery={filters.testCaseFilter.titleQuery ?? ""}
        searchPlaceholder="Search suites or test cases…"
        resultSummary={`${options.visibleTestCaseCount} results`}
        onTitleQueryChange={(next) => filters.setTestCaseFilter({
          ...filters.testCaseFilter,
          titleQuery: next.length > 0 ? next : undefined
        })}
        facets={testCaseFilterFacets}
        onToggleFacetValue={toggleTestCaseFacet}
        onReplaceFacetValues={replaceTestCaseFacet}
        onClear={clearTestCaseFilters}
        quickActions={[
          {
            id: "failed-tests",
            label: "Failed tests",
            pressed: filters.testCaseFilter.lastOutcomes?.includes("Failed") ?? false,
            showActiveChip: false,
            onToggle: () => toggleTestCaseFacet("lastOutcomes", "Failed")
          },
          relationQuickAction(
            "linked-tests",
            "Only linked",
            "linked",
            testCaseRelationVisibility,
            setTestCaseRelationVisibility
          ),
          relationQuickAction(
            "unlinked-tests",
            "Only unlinked",
            "unlinked",
            testCaseRelationVisibility,
            setTestCaseRelationVisibility
          )
        ]}
      />
    ),
    workItemFilterBar: (
      <FilterBar
        ariaLabel="Work items"
        titleQuery={filters.workItemFilter.titleQuery ?? ""}
        searchPlaceholder="Search work items…"
        resultSummary={`${options.visibleWorkItemCount} results`}
        onTitleQueryChange={(next) => filters.setWorkItemFilter({
          ...filters.workItemFilter,
          titleQuery: next.length > 0 ? next : undefined
        })}
        facets={workItemFilterFacets}
        onToggleFacetValue={toggleWorkItemFacet}
        onReplaceFacetValues={replaceWorkItemFacet}
        onClear={clearWorkItemFilters}
        quickActions={[
          {
            id: "open-bugs",
            label: "Open bugs",
            pressed: openBugsOnly,
            onToggle: () => setOpenBugsOnly(!openBugsOnly)
          },
          relationQuickAction(
            "linked-work-items",
            "Only linked",
            "linked",
            workItemRelationVisibility,
            setWorkItemRelationVisibility
          ),
          relationQuickAction(
            "unlinked-work-items",
            "Only unlinked",
            "unlinked",
            workItemRelationVisibility,
            setWorkItemRelationVisibility
          )
        ]}
      />
    )
  };
}

function relationQuickAction(
  id: string,
  label: string,
  target: Exclude<RelationVisibility, "all">,
  current: RelationVisibility,
  setVisibility: (next: RelationVisibility) => void
) {
  return {
    id,
    label,
    pressed: current === target,
    onToggle: () => setVisibility(current === target ? "all" : target)
  };
}

function buildTestCaseFacets(
  facets: ReturnType<typeof extractTestCaseFacets>,
  filter: SetFiltersApi["testCaseFilter"],
  projections: readonly TestCaseProjection[]
): FilterFacet[] {
  return [
    facet("lastOutcomes", "Outcome", facets.lastOutcomes, filter.lastOutcomes, projections, (p) => [p.lastOutcome]),
    facet("states", "State", facets.states, filter.states, projections, (p) => [p.state]),
    facet("assignedTo", "Assigned to", facets.assignedTo, filter.assignedTo, projections, (p) => p.assignedTo ? [p.assignedTo] : []),
    facet("tags", "Tags", facets.tags, filter.tags, projections, (p) => p.tags),
    facet("workItemTypes", "Type", facets.workItemTypes, filter.workItemTypes, projections, (p) => [p.workItemType])
  ];
}

function buildWorkItemFacets(
  facets: ReturnType<typeof extractWorkItemFacets>,
  filter: SetFiltersApi["workItemFilter"],
  workItems: readonly WorkItem[]
): FilterFacet[] {
  return [
    facet("states", "State", facets.states, filter.states, workItems, (item) => [item.state]),
    facet("assignedTo", "Assigned to", facets.assignedTo, filter.assignedTo, workItems, (item) => item.assignedTo ? [item.assignedTo] : []),
    facet("tags", "Tags", facets.tags, filter.tags, workItems, (item) => item.tags),
    facet("workItemTypes", "Type", facets.workItemTypes, filter.workItemTypes, workItems, (item) => [item.workItemType])
  ];
}

function facet<T>(
  kind: FilterFacetKind,
  label: string,
  values: readonly string[],
  selected: readonly string[] | undefined,
  rows: readonly T[],
  readValues: (row: T) => readonly string[]
): FilterFacet {
  return {
    kind,
    label,
    options: buildFacetOptions(values, rows, readValues),
    selected: selected ?? []
  };
}

function readListForKind(
  filter: SetFiltersApi["testCaseFilter"] | SetFiltersApi["workItemFilter"],
  kind: FilterFacetKind
): readonly string[] | undefined {
  return (filter as Record<string, readonly string[] | undefined>)[kind];
}
