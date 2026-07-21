import {
  flattenSuiteTree,
  type TestSuiteFlatEntry,
  type TestSuiteNode
} from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";

export type SuiteExplorerEntry = {
  suite: TestSuiteFlatEntry;
  projections: TestCaseProjection[];
  naturalIds: number[];
  totalProjectionCount: number;
  visibleBranchProjectionCount: number;
  branchProjectionCount: number;
  hasChildren: boolean;
};

export function buildSuiteExplorerEntries(
  tree: TestSuiteNode,
  projections: readonly TestCaseProjection[],
  allProjections: readonly TestCaseProjection[]
): SuiteExplorerEntry[] {
  const flat = flattenSuiteTree(tree);
  const visibleBySuite = indexProjectionsBySuite(projections);
  const allBySuite = indexProjectionsBySuite(allProjections);
  const suitesWithChildren = new Set<number>();
  flat.forEach((suite) => {
    if (suite.parentSuiteId !== null) {
      suitesWithChildren.add(suite.parentSuiteId);
    }
  });

  const baseEntries = flat.map((suite) => {
    const allForSuite = (allBySuite.get(suite.id) ?? []).slice().sort(compareProjections);
    return {
      suite,
      projections: (visibleBySuite.get(suite.id) ?? []).slice().sort(compareProjections),
      naturalIds: allForSuite.map((projection) => projection.workItemId),
      totalProjectionCount: allForSuite.length,
      hasChildren: suitesWithChildren.has(suite.id),
      visibleBranchProjectionCount: 0,
      branchProjectionCount: 0
    };
  });
  const visibleBranchCounts = new Map(
    baseEntries.map((entry) => [entry.suite.id, entry.projections.length])
  );
  const branchCounts = new Map(
    baseEntries.map((entry) => [entry.suite.id, entry.totalProjectionCount])
  );
  for (let index = baseEntries.length - 1; index >= 0; index -= 1) {
    const entry = baseEntries[index];
    const parentId = entry.suite.parentSuiteId;
    if (parentId === null) {
      continue;
    }
    visibleBranchCounts.set(
      parentId,
      (visibleBranchCounts.get(parentId) ?? 0) + (visibleBranchCounts.get(entry.suite.id) ?? 0)
    );
    branchCounts.set(
      parentId,
      (branchCounts.get(parentId) ?? 0) + (branchCounts.get(entry.suite.id) ?? 0)
    );
  }
  return baseEntries.map((entry) => ({
    ...entry,
    visibleBranchProjectionCount: visibleBranchCounts.get(entry.suite.id) ?? 0,
    branchProjectionCount: branchCounts.get(entry.suite.id) ?? 0
  }));
}

export function selectVisibleSuiteEntries(
  entries: readonly SuiteExplorerEntry[],
  collapse: SuiteCollapseApi,
  options: { hideEmptySuites: boolean; searchQuery: string }
): SuiteExplorerEntry[] {
  const searchActive = options.searchQuery.trim().length > 0;
  const structurallyIncluded = computeStructuralInclusion(entries, {
    hideEmptySuites: options.hideEmptySuites,
    searchActive,
    searchQuery: options.searchQuery
  });
  const visible: SuiteExplorerEntry[] = [];
  let collapseDepth: number | null = null;

  entries.forEach((entry) => {
    if (!structurallyIncluded.has(entry.suite.id)) {
      return;
    }
    if (!searchActive && collapseDepth !== null && entry.suite.depth > collapseDepth) {
      return;
    }
    if (!searchActive) {
      collapseDepth = null;
    }
    visible.push(entry);
    if (!searchActive && collapse.isCollapsed(entry.suite.id)) {
      collapseDepth = entry.suite.depth;
    }
  });

  return visible;
}

function computeStructuralInclusion(
  entries: readonly SuiteExplorerEntry[],
  options: { hideEmptySuites: boolean; searchActive: boolean; searchQuery: string }
): Set<number> {
  if (!options.hideEmptySuites && !options.searchActive) {
    return new Set(entries.map((entry) => entry.suite.id));
  }

  const included = new Set<number>();
  const parentById = new Map(entries.map((entry) => [entry.suite.id, entry.suite.parentSuiteId]));
  const searchNeedle = options.searchQuery.trim().toLocaleLowerCase();
  entries.forEach((entry) => {
    const hasVisibleMatch = entry.visibleBranchProjectionCount > 0;
    const hasAnyContent = entry.branchProjectionCount > 0;
    const suiteNameMatches = searchNeedle.length > 0 &&
      entry.suite.name.toLocaleLowerCase().includes(searchNeedle);
    if (
      (options.searchActive && (hasVisibleMatch || suiteNameMatches)) ||
      (!options.searchActive && hasAnyContent)
    ) {
      includeWithParents(entry.suite.id, parentById, included);
    }
  });

  if (entries.length > 0) {
    included.add(entries[0].suite.id);
  }
  return included;
}

function includeWithParents(
  suiteId: number,
  parentById: ReadonlyMap<number, number | null>,
  included: Set<number>
): void {
  let current: number | null | undefined = suiteId;
  while (current !== null && current !== undefined && !included.has(current)) {
    included.add(current);
    current = parentById.get(current);
  }
}

function indexProjectionsBySuite(
  projections: readonly TestCaseProjection[]
): Map<number, TestCaseProjection[]> {
  const bySuite = new Map<number, TestCaseProjection[]>();
  projections.forEach((projection) => {
    const list = bySuite.get(projection.suiteId);
    if (list) {
      list.push(projection);
    } else {
      bySuite.set(projection.suiteId, [projection]);
    }
  });
  return bySuite;
}

function compareProjections(a: TestCaseProjection, b: TestCaseProjection): number {
  if (a.title === b.title) {
    return a.workItemId - b.workItemId;
  }
  return a.title.localeCompare(b.title);
}
