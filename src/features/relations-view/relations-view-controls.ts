import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { RelationAdjacencyIndex } from "../../domain/relations/snapshot-relation-index.js";
import type { RelationVisibilityPreference } from "../../shared/user-preferences/user-preferences.schema.js";

export type RelationVisibility = RelationVisibilityPreference;

const TERMINAL_STATES = new Set(["closed", "resolved", "done", "removed", "completed"]);

export type RelationSummary = {
  relationCount: number;
  unlinkedTestCaseCount: number;
  unlinkedWorkItemCount: number;
};

export function buildRelationSummary(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  relationIndex: RelationAdjacencyIndex
): RelationSummary {
  const testCaseIds = new Set(projections.map((projection) => projection.workItemId));
  const workItemIds = new Set(workItems.map((workItem) => workItem.id));
  const linkedTestCaseIds = new Set<number>();
  const linkedWorkItemIds = new Set<number>();
  let relationCount = 0;

  testCaseIds.forEach((testCaseId) => {
    relationIndex.workItemIdsByTestCaseId.get(testCaseId)?.forEach((workItemId) => {
      if (!workItemIds.has(workItemId)) {
        return;
      }
      relationCount += 1;
      linkedTestCaseIds.add(testCaseId);
      linkedWorkItemIds.add(workItemId);
    });
  });

  return {
    relationCount,
    unlinkedTestCaseCount: [...testCaseIds].filter((id) => !linkedTestCaseIds.has(id)).length,
    unlinkedWorkItemCount: workItems.filter((item) => !linkedWorkItemIds.has(item.id)).length
  };
}

export function filterProjectionsByRelationVisibility(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  visibility: RelationVisibility,
  relationIndex: RelationAdjacencyIndex
): TestCaseProjection[] {
  if (visibility === "all") {
    return projections.slice();
  }
  const linkedTestCaseIds = collectLinkedTestCaseIds(workItems, relationIndex);
  return projections.filter((projection) => {
    const linked = linkedTestCaseIds.has(projection.workItemId);
    return visibility === "linked" ? linked : !linked;
  });
}

export function filterWorkItemsByRelationVisibility(
  workItems: readonly WorkItem[],
  projections: readonly TestCaseProjection[],
  visibility: RelationVisibility,
  relationIndex: RelationAdjacencyIndex
): WorkItem[] {
  if (visibility === "all") {
    return workItems.slice();
  }
  const linkedWorkItemIds = collectLinkedWorkItemIds(projections, relationIndex);
  return workItems.filter((workItem) => {
    const linked = linkedWorkItemIds.has(workItem.id);
    return visibility === "linked" ? linked : !linked;
  });
}

export function filterOpenBugs(workItems: readonly WorkItem[], enabled: boolean): WorkItem[] {
  if (!enabled) {
    return workItems.slice();
  }
  return workItems.filter((workItem) =>
    workItem.workItemType.trim().toLocaleLowerCase() === "bug" && !isTerminalState(workItem.state)
  );
}

export function resolveFocusedWorkItemIds(
  focusedSuiteIds: ReadonlySet<number> | null,
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  relationIndex: RelationAdjacencyIndex
): Set<number> {
  if (focusedSuiteIds === null) {
    return new Set();
  }
  const testCaseIds = new Set(
    projections
      .filter((projection) => focusedSuiteIds.has(projection.suiteId))
      .map((projection) => projection.workItemId)
  );
  const availableWorkItemIds = new Set(workItems.map((workItem) => workItem.id));
  const focusedWorkItemIds = new Set<number>();
  testCaseIds.forEach((testCaseId) => {
    relationIndex.workItemIdsByTestCaseId.get(testCaseId)?.forEach((workItemId) => {
      if (availableWorkItemIds.has(workItemId)) {
        focusedWorkItemIds.add(workItemId);
      }
    });
  });
  return focusedWorkItemIds;
}

function collectLinkedTestCaseIds(
  workItems: readonly WorkItem[],
  relationIndex: RelationAdjacencyIndex
): Set<number> {
  const linked = new Set<number>();
  workItems.forEach((workItem) => {
    relationIndex.testCaseIdsByWorkItemId.get(workItem.id)?.forEach((testCaseId) => {
      linked.add(testCaseId);
    });
  });
  return linked;
}

function collectLinkedWorkItemIds(
  projections: readonly TestCaseProjection[],
  relationIndex: RelationAdjacencyIndex
): Set<number> {
  const linked = new Set<number>();
  const testCaseIds = new Set(projections.map((projection) => projection.workItemId));
  testCaseIds.forEach((testCaseId) => {
    relationIndex.workItemIdsByTestCaseId.get(testCaseId)?.forEach((workItemId) => {
      linked.add(workItemId);
    });
  });
  return linked;
}

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state.trim().toLocaleLowerCase());
}
