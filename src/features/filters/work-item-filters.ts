import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { WorkItemColumnFilterPreference } from "../../shared/user-preferences/user-preferences.client.js";

export type WorkItemFacets = {
  states: string[];
  assignedTo: string[];
  tags: string[];
  workItemTypes: string[];
};

export function extractWorkItemFacets(workItems: readonly WorkItem[]): WorkItemFacets {
  const states = new Set<string>();
  const assignedTo = new Set<string>();
  const tags = new Set<string>();
  const workItemTypes = new Set<string>();

  for (const item of workItems) {
    if (item.state) {
      states.add(item.state);
    }
    if (item.assignedTo) {
      assignedTo.add(item.assignedTo);
    }
    for (const tag of item.tags) {
      if (tag) {
        tags.add(tag);
      }
    }
    if (item.workItemType) {
      workItemTypes.add(item.workItemType);
    }
  }

  return {
    states: sortFacet(states),
    assignedTo: sortFacet(assignedTo),
    tags: sortFacet(tags),
    workItemTypes: sortFacet(workItemTypes)
  };
}

/**
 * Mirrors `filterTestCases` semantics — same AND-of-facets, OR-within-facet
 * composition — but operates on the right column's `WorkItem[]` shape (no
 * outcome axis).
 */
export function filterWorkItems(
  workItems: readonly WorkItem[],
  filter: WorkItemColumnFilterPreference | undefined
): WorkItem[] {
  if (!filter || !hasAnyAxis(filter)) {
    return workItems.slice();
  }

  const titleNeedle = (filter.titleQuery ?? "").trim().toLowerCase();
  const states = toMatcherSet(filter.states);
  const assignedTo = toMatcherSet(filter.assignedTo);
  const tags = toMatcherSet(filter.tags);
  const workItemTypes = toMatcherSet(filter.workItemTypes);

  return workItems.filter((item) => {
    if (titleNeedle.length > 0 && !item.title.toLowerCase().includes(titleNeedle)) {
      return false;
    }
    if (states && !states.has(item.state)) {
      return false;
    }
    if (assignedTo && (!item.assignedTo || !assignedTo.has(item.assignedTo))) {
      return false;
    }
    if (tags && !item.tags.some((tag) => tags.has(tag))) {
      return false;
    }
    if (workItemTypes && !workItemTypes.has(item.workItemType)) {
      return false;
    }
    return true;
  });
}

function hasAnyAxis(filter: WorkItemColumnFilterPreference): boolean {
  if (filter.titleQuery && filter.titleQuery.trim().length > 0) {
    return true;
  }
  return Boolean(
    (filter.states && filter.states.length > 0) ||
      (filter.assignedTo && filter.assignedTo.length > 0) ||
      (filter.tags && filter.tags.length > 0) ||
      (filter.workItemTypes && filter.workItemTypes.length > 0)
  );
}

function toMatcherSet(list: readonly string[] | undefined): Set<string> | null {
  if (!list || list.length === 0) {
    return null;
  }
  return new Set(list);
}

function sortFacet(values: ReadonlySet<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
