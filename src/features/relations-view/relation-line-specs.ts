import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import {
  buildSnapshotRelationIndex,
  snapshotRelationKey,
  type RelationAdjacencyIndex
} from "../../domain/relations/snapshot-relation-index.js";
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
const STATUS_CONFLICT_SEPARATOR = "::";
const STATUS_CONFLICTS = new Set([
  "New::Passed",
  "Active::Passed",
  "Resolved::Failed",
  "Closed::Failed",
  "Resolved::Blocked",
  "Closed::Blocked"
]);

export type RelationStatusReader = {
  relationIndex: RelationAdjacencyIndex;
  isPending: (testCaseId: number, workItemId: number) => boolean;
};

export type RelationPair = {
  testCaseId: number;
  workItemId: number;
};

/**
 * Builds the set of `(testCaseId::workItemId)` keys that are linked in the
 * snapshot. Delegates to {@link buildSnapshotRelationIndex} so the symmetry
 * rule (`System.LinkTypes.Related` carrying both sides) lives in the
 * Relations bounded context and the same logic is reusable from diagnostics.
 */
export function buildSnapshotRelationSet(snapshot: ActiveSetSnapshot | null): Set<string> {
  if (!snapshot) {
    return new Set();
  }
  return new Set(buildSnapshotRelationIndex(snapshot.projections, snapshot.workItemsFromQuery));
}

export { snapshotRelationKey };

/**
 * Computes the line specs to render. Lines anchor only to endpoints that
 * survive the active filter — hidden endpoints would leave dangling lines.
 */
export function buildLineSpecs(
  projections: readonly TestCaseProjection[],
  workItems: readonly WorkItem[],
  mutations: RelationStatusReader
): LineSpec[] {
  const visibleWorkItemsById = new Map(workItems.map((workItem) => [workItem.id, workItem]));
  const seenLineIds = new Set<string>();
  const out: LineSpec[] = [];

  for (const projection of projections) {
    const tcKey = testCaseItemKey(projection.workItemId, projection.suiteId);
    const relatedWorkItemIds = mutations.relationIndex.workItemIdsByTestCaseId.get(
      projection.workItemId
    );
    if (!relatedWorkItemIds) {
      continue;
    }
    for (const wiId of relatedWorkItemIds) {
      const workItem = visibleWorkItemsById.get(wiId);
      if (!workItem) {
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
        pending: mutations.isPending(projection.workItemId, wiId),
        conflict: isStatusConflict(workItem.state, projection.lastOutcome)
      });
    }
  }

  return out;
}

function isStatusConflict(workItemState: string, testCaseOutcome: string): boolean {
  return STATUS_CONFLICTS.has(`${workItemState}${STATUS_CONFLICT_SEPARATOR}${testCaseOutcome}`);
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
