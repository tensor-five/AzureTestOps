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

export type RelationAdjacencyIndex = {
  relationKeys: ReadonlySet<string>;
  workItemIdsByTestCaseId: ReadonlyMap<number, ReadonlySet<number>>;
  testCaseIdsByWorkItemId: ReadonlyMap<number, ReadonlySet<number>>;
};

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
 * Materializes both directions of an already validated relation-key set.
 * Consumers can then answer summary, filter and line-rendering queries in
 * O(items + relations) instead of repeatedly scanning the Cartesian product
 * of Test Cases and Work Items.
 */
export function buildRelationAdjacencyIndex(
  relationKeys: ReadonlySet<string>
): RelationAdjacencyIndex {
  const normalizedKeys = new Set<string>();
  const workItemIdsByTestCaseId = new Map<number, Set<number>>();
  const testCaseIdsByWorkItemId = new Map<number, Set<number>>();

  for (const key of relationKeys) {
    const pair = parseSnapshotRelationKey(key);
    if (!pair) {
      continue;
    }
    const normalizedKey = snapshotRelationKey(pair.testCaseId, pair.workItemId);
    normalizedKeys.add(normalizedKey);
    addToIndex(workItemIdsByTestCaseId, pair.testCaseId, pair.workItemId);
    addToIndex(testCaseIdsByWorkItemId, pair.workItemId, pair.testCaseId);
  }

  return {
    relationKeys: normalizedKeys,
    workItemIdsByTestCaseId,
    testCaseIdsByWorkItemId
  };
}

function parseSnapshotRelationKey(
  key: string
): { testCaseId: number; workItemId: number } | null {
  const [rawTestCaseId, rawWorkItemId, ...rest] = key.split(KEY_SEPARATOR);
  if (rest.length > 0) {
    return null;
  }
  const testCaseId = Number(rawTestCaseId);
  const workItemId = Number(rawWorkItemId);
  if (!isPositiveInteger(testCaseId) || !isPositiveInteger(workItemId)) {
    return null;
  }
  return { testCaseId, workItemId };
}

function addToIndex(
  index: Map<number, Set<number>>,
  sourceId: number,
  targetId: number
): void {
  const current = index.get(sourceId);
  if (current) {
    current.add(targetId);
    return;
  }
  index.set(sourceId, new Set([targetId]));
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
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
