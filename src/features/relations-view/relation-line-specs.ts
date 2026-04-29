import type { ActiveSetSnapshot } from "../../domain/sets/set.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import {
  parseItemKey,
  testCaseItemKey,
  workItemItemKey
} from "./item-key.js";
import type { LineSpec } from "./relation-line-layer.js";

/**
 * Pure data-shaping helpers extracted from `relations-pane.tsx` so the
 * orchestrator stays an orchestrator (per AGENTS.md §1). All functions are
 * deterministic given their inputs and have their own unit specs.
 */

const LINE_ID_SEPARATOR = "->";

export type RelationStatusReader = {
  isRelated: (testCaseId: number, workItemId: number) => boolean;
  isPending: (testCaseId: number, workItemId: number) => boolean;
};

export type RelationPair = {
  testCaseId: number;
  workItemId: number;
};

/**
 * Builds the set of `(testCaseId::workItemId)` keys that are linked in the
 * snapshot. Walks both sides of `relatedIds` because `System.LinkTypes.Related`
 * is symmetric in Azure DevOps but partial data may have one side missing.
 */
export function buildSnapshotRelationSet(snapshot: ActiveSetSnapshot | null): Set<string> {
  const set = new Set<string>();
  if (!snapshot) {
    return set;
  }
  const workItemIdsInQuery = new Set<number>();
  for (const wi of snapshot.workItemsFromQuery) {
    workItemIdsInQuery.add(wi.id);
  }
  const testCaseIdsInProjections = new Set<number>();
  for (const projection of snapshot.projections) {
    testCaseIdsInProjections.add(projection.workItemId);
  }

  for (const projection of snapshot.projections) {
    for (const relatedId of projection.relatedIds) {
      if (workItemIdsInQuery.has(relatedId)) {
        set.add(`${projection.workItemId}::${relatedId}`);
      }
    }
  }
  for (const wi of snapshot.workItemsFromQuery) {
    for (const relatedId of wi.relatedIds) {
      if (testCaseIdsInProjections.has(relatedId)) {
        set.add(`${relatedId}::${wi.id}`);
      }
    }
  }
  return set;
}

/**
 * Computes the line specs to render. Lines anchor only to endpoints that
 * survive the active filter — hidden endpoints would leave dangling lines.
 */
export function buildLineSpecs(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  mutations: RelationStatusReader
): LineSpec[] {
  const workItemIds = workItems.map((wi) => wi.id);
  const seenLineIds = new Set<string>();
  const out: LineSpec[] = [];

  for (const projection of projections) {
    const tcKey = testCaseItemKey(projection.workItemId, projection.suiteId);
    for (const wiId of workItemIds) {
      if (!mutations.isRelated(projection.workItemId, wiId)) {
        continue;
      }
      const wiKey = workItemItemKey(wiId);
      const lineId = `${tcKey}${LINE_ID_SEPARATOR}${wiKey}`;
      if (seenLineIds.has(lineId)) {
        continue;
      }
      seenLineIds.add(lineId);
      out.push({
        lineId,
        testCaseItemKey: tcKey,
        workItemItemKey: wiKey,
        testCaseWorkItemId: projection.workItemId,
        workItemWorkItemId: wiId,
        pending: mutations.isPending(projection.workItemId, wiId)
      });
    }
  }

  return out;
}

/**
 * Resolves an unordered pair of item keys (one test case, one work item) to
 * the `(testCaseId, workItemId)` pair regardless of which side was passed first.
 */
export function resolvePairFromItemKeys(a: string, b: string): RelationPair | null {
  const parsedA = parseItemKey(a);
  const parsedB = parseItemKey(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  if (parsedA.kind === "test-case" && parsedB.kind === "work-item") {
    return { testCaseId: parsedA.workItemId, workItemId: parsedB.workItemId };
  }
  if (parsedA.kind === "work-item" && parsedB.kind === "test-case") {
    return { testCaseId: parsedB.workItemId, workItemId: parsedA.workItemId };
  }
  return null;
}

export function parseLineId(lineId: string): RelationPair | null {
  const [left, right] = lineId.split(LINE_ID_SEPARATOR);
  if (!left || !right) {
    return null;
  }
  return resolvePairFromItemKeys(left, right);
}

/**
 * Cheap layout-version signal for the SVG line layer: a change in the number
 * of saved offsets is enough to trigger a recompute, since each card also
 * fires a ResizeObserver event when its transform style updates.
 */
export function countPositions(positions: Readonly<Record<string, unknown>>): number {
  return Object.keys(positions).length;
}
