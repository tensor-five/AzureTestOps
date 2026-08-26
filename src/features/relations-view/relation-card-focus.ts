import type { RelationAdjacencyIndex } from "../../domain/relations/snapshot-relation-index.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

export type RelationCardFocus =
  | { kind: "test-case"; workItemId: number }
  | { kind: "work-item"; workItemId: number };

export type ResolvedRelationCardFocus = {
  testCaseIds: ReadonlySet<number>;
  workItemIds: ReadonlySet<number>;
  relationKeys: ReadonlySet<string>;
};

export function resolveRelationCardFocus(
  focus: RelationCardFocus | null,
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  relationIndex: RelationAdjacencyIndex
): ResolvedRelationCardFocus {
  if (focus === null) {
    return emptyFocus();
  }

  const availableTestCaseIds = new Set(projections.map((projection) => projection.workItemId));
  const availableWorkItemIds = new Set(workItems.map((workItem) => workItem.id));
  const testCaseIds = new Set<number>();
  const workItemIds = new Set<number>();

  if (focus.kind === "test-case") {
    if (!availableTestCaseIds.has(focus.workItemId)) {
      return emptyFocus();
    }
    testCaseIds.add(focus.workItemId);
    relationIndex.workItemIdsByTestCaseId.get(focus.workItemId)?.forEach((workItemId) => {
      if (availableWorkItemIds.has(workItemId)) {
        workItemIds.add(workItemId);
      }
    });
  } else {
    if (!availableWorkItemIds.has(focus.workItemId)) {
      return emptyFocus();
    }
    workItemIds.add(focus.workItemId);
    relationIndex.testCaseIdsByWorkItemId.get(focus.workItemId)?.forEach((testCaseId) => {
      if (availableTestCaseIds.has(testCaseId)) {
        testCaseIds.add(testCaseId);
      }
    });
  }

  const relationKeys = new Set<string>();
  testCaseIds.forEach((testCaseId) => {
    relationIndex.workItemIdsByTestCaseId.get(testCaseId)?.forEach((workItemId) => {
      if (workItemIds.has(workItemId)) {
        relationKeys.add(relationCardFocusRelationKey(testCaseId, workItemId));
      }
    });
  });

  return { testCaseIds, workItemIds, relationKeys };
}

export function relationCardFocusRelationKey(testCaseId: number, workItemId: number): string {
  return `${testCaseId}::${workItemId}`;
}

function emptyFocus(): ResolvedRelationCardFocus {
  return { testCaseIds: new Set(), workItemIds: new Set(), relationKeys: new Set() };
}
