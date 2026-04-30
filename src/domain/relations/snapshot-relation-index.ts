import type { TestCaseProjection } from "../test-management/test-case-projection.js";
import type { WorkItem } from "../work-items/work-item.js";

const KEY_SEPARATOR = "::";

/**
 * Pre-computed lookup of `(testCaseId, workItemId)` pairs that are linked in
 * an active-set snapshot via `System.LinkTypes.Related`.
 *
 * The relation is symmetric in Azure DevOps but partial data may have only
 * one side populated, so the index walks both sides. Pairs are only included
 * when *both* endpoints survive in the snapshot — a relation pointing at an
 * id outside the current set or query is treated as a dangling reference.
 */
export type SnapshotRelationIndex = ReadonlySet<string>;

export function buildSnapshotRelationIndex(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[]
): SnapshotRelationIndex {
  const index = new Set<string>();
  if (projections.length === 0 || workItems.length === 0) {
    return index;
  }

  const workItemIds = new Set<number>();
  for (const wi of workItems) {
    workItemIds.add(wi.id);
  }
  const testCaseIds = new Set<number>();
  for (const projection of projections) {
    testCaseIds.add(projection.workItemId);
  }

  for (const projection of projections) {
    for (const relatedId of projection.relatedIds) {
      if (workItemIds.has(relatedId)) {
        index.add(snapshotRelationKey(projection.workItemId, relatedId));
      }
    }
  }
  for (const wi of workItems) {
    for (const relatedId of wi.relatedIds) {
      if (testCaseIds.has(relatedId)) {
        index.add(snapshotRelationKey(relatedId, wi.id));
      }
    }
  }
  return index;
}

export function snapshotRelationKey(testCaseId: number, workItemId: number): string {
  return `${testCaseId}${KEY_SEPARATOR}${workItemId}`;
}

/**
 * One-shot existence check that mirrors {@link buildSnapshotRelationIndex}
 * for callers that only need a single pair (e.g. the diagnostic route).
 */
export function isRelationLinkedInSnapshot(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  testCaseId: number,
  workItemId: number
): boolean {
  const projection = projections.find((p) => p.workItemId === testCaseId);
  if (!projection) {
    return false;
  }
  const workItem = workItems.find((wi) => wi.id === workItemId);
  if (!workItem) {
    return false;
  }
  return (
    projections.some((p) => p.workItemId === testCaseId && p.relatedIds.includes(workItemId)) ||
    workItem.relatedIds.includes(testCaseId)
  );
}
