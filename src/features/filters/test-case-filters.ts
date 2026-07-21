import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestCaseColumnFilterPreference } from "../../shared/user-preferences/user-preferences.client.js";

/**
 * Distinct values that populate the multi-select facets of the Test Cases
 * filter bar. Each list is sorted alphabetically (case-insensitive) so the UI
 * order is deterministic; identifiers are kept in their original casing for
 * display.
 */
export type TestCaseFacets = {
  lastOutcomes: string[];
  states: string[];
  assignedTo: string[];
  tags: string[];
  workItemTypes: string[];
};

export function extractTestCaseFacets(
  projections: readonly TestCaseProjection[]
): TestCaseFacets {
  const outcomes = new Set<string>();
  const states = new Set<string>();
  const assignedTo = new Set<string>();
  const tags = new Set<string>();
  const workItemTypes = new Set<string>();

  for (const projection of projections) {
    if (projection.lastOutcome) {
      outcomes.add(projection.lastOutcome);
    }
    if (projection.state) {
      states.add(projection.state);
    }
    if (projection.assignedTo) {
      assignedTo.add(projection.assignedTo);
    }
    for (const tag of projection.tags) {
      if (tag) {
        tags.add(tag);
      }
    }
    if (projection.workItemType) {
      workItemTypes.add(projection.workItemType);
    }
  }

  return {
    lastOutcomes: sortFacet(outcomes),
    states: sortFacet(states),
    assignedTo: sortFacet(assignedTo),
    tags: sortFacet(tags),
    workItemTypes: sortFacet(workItemTypes)
  };
}

/**
 * Filters test-case projections by the persisted filter state. Empty arrays
 * and blank strings short-circuit per facet. Within a facet, semantics are OR
 * (any selected value is a match); across facets they are AND (every
 * configured facet must match). A blank `assignedTo` on the projection is
 * treated as "no assignee" and is excluded whenever the assignedTo facet is
 * configured.
 */
export function filterTestCases(
  projections: readonly TestCaseProjection[],
  filter: TestCaseColumnFilterPreference | undefined
): TestCaseProjection[] {
  if (!filter || !hasAnyAxis(filter)) {
    return projections.slice();
  }

  const titleNeedle = (filter.titleQuery ?? "").trim().toLowerCase();
  const lastOutcomes = toMatcherSet(filter.lastOutcomes);
  const states = toMatcherSet(filter.states);
  const assignedTo = toMatcherSet(filter.assignedTo);
  const tags = toMatcherSet(filter.tags);
  const workItemTypes = toMatcherSet(filter.workItemTypes);

  return projections.filter((projection) => {
    if (
      titleNeedle.length > 0 &&
      !projection.title.toLowerCase().includes(titleNeedle) &&
      !projection.suitePath.toLowerCase().includes(titleNeedle)
    ) {
      return false;
    }
    if (lastOutcomes && !lastOutcomes.has(projection.lastOutcome)) {
      return false;
    }
    if (states && !states.has(projection.state)) {
      return false;
    }
    if (assignedTo && (!projection.assignedTo || !assignedTo.has(projection.assignedTo))) {
      return false;
    }
    if (tags && !projection.tags.some((tag) => tags.has(tag))) {
      return false;
    }
    if (workItemTypes && !workItemTypes.has(projection.workItemType)) {
      return false;
    }
    return true;
  });
}

function hasAnyAxis(filter: TestCaseColumnFilterPreference): boolean {
  if (filter.titleQuery && filter.titleQuery.trim().length > 0) {
    return true;
  }
  return Boolean(
    (filter.lastOutcomes && filter.lastOutcomes.length > 0) ||
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
