export type MagicSortSuite = {
  suiteId: number;
  testCaseIds: readonly number[];
};

export type MagicSortWorkItem = {
  id: number;
  relatedTestCaseIds: readonly number[];
};

export type MagicSortVisibleRow =
  | { kind: "suite-header"; suiteId: number }
  | { kind: "test-case"; suiteId: number; testCaseId: number };

export type MagicSortInput = {
  suites: readonly MagicSortSuite[];
  visibleRows?: readonly MagicSortVisibleRow[];
  workItemIds: readonly number[];
  workItems: readonly MagicSortWorkItem[];
  addSpacer?: boolean;
  workItemPositions?: Readonly<Record<number, number>>;
  measuredTestCaseSlotCenters?: readonly number[];
  measuredWorkItemSlotCenters?: readonly number[];
};

export type MagicSortLayout = {
  suites: readonly MagicSortSuite[];
  workItemIds: readonly number[];
  workItemPositions?: Readonly<Record<number, number>>;
};

export type MagicSortPlan = {
  steps: readonly MagicSortLayout[];
};

type Metrics = { crossings: number; length: number };

/**
 * Finds deterministic, Pareto-improving adjacent moves. Test cases are only
 * ever swapped inside the suite that already contains them.
 */
export function planMagicSort(input: MagicSortInput): MagicSortPlan {
  const workItems = new Map(input.workItems.map((workItem) => [workItem.id, workItem]));
  const workItemPositions = input.addSpacer
    ? initialWorkItemPositions(input.workItemIds, input.workItemPositions, workItems)
    : undefined;
  let current: MagicSortLayout = {
    suites: input.suites.map((suite) => ({ ...suite, testCaseIds: [...suite.testCaseIds] })),
    workItemIds: workItemPositions
      ? orderWorkItemsByPosition(input.workItemIds, workItemPositions)
      : [...input.workItemIds],
    ...(workItemPositions ? { workItemPositions } : {})
  };
  const steps: MagicSortLayout[] = [current];

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const next = findBestImprovement(current, workItems, input.visibleRows, input.measuredTestCaseSlotCenters, input.measuredWorkItemSlotCenters);
    if (!next) {
      break;
    }
    current = next;
    steps.push(current);
  }
  return { steps };
}

function findBestImprovement(
  current: MagicSortLayout,
  workItems: ReadonlyMap<number, MagicSortWorkItem>,
  visibleRows: readonly MagicSortVisibleRow[] | undefined,
  measuredTestCaseSlotCenters?: readonly number[],
  measuredWorkItemSlotCenters?: readonly number[]
): MagicSortLayout | null {
  const currentMetrics = measure(current, workItems, visibleRows, measuredTestCaseSlotCenters, measuredWorkItemSlotCenters);
  let best: MagicSortLayout | null = null;
  let bestMetrics: Metrics | null = null;

  const consider = (candidate: MagicSortLayout) => {
    const metrics = measure(candidate, workItems, visibleRows, measuredTestCaseSlotCenters, measuredWorkItemSlotCenters);
    if (!dominates(metrics, currentMetrics)) {
      return;
    }
    if (!bestMetrics || compareMetrics(metrics, bestMetrics) < 0) {
      best = candidate;
      bestMetrics = metrics;
    }
  };

  if (!current.workItemPositions) {
    for (let index = 0; index < current.workItemIds.length - 1; index += 1) {
      consider({
        suites: current.suites,
        workItemIds: swapAt(current.workItemIds, index)
      });
    }
  } else {
    considerFreeWorkItemSlots(current, visibleRows, workItems, measuredWorkItemSlotCenters, consider);
  }
  for (let suiteIndex = 0; suiteIndex < current.suites.length; suiteIndex += 1) {
    const suite = current.suites[suiteIndex]!;
    for (let index = 0; index < suite.testCaseIds.length - 1; index += 1) {
      consider({
        workItemIds: current.workItemIds,
        ...(current.workItemPositions ? { workItemPositions: current.workItemPositions } : {}),
        suites: current.suites.map((candidateSuite, candidateSuiteIndex) =>
          candidateSuiteIndex === suiteIndex
            ? { ...candidateSuite, testCaseIds: swapAt(candidateSuite.testCaseIds, index) }
            : candidateSuite
        )
      });
    }
  }
  return best;
}

function measure(
  layout: MagicSortLayout,
  workItems: ReadonlyMap<number, MagicSortWorkItem>,
  visibleRows: readonly MagicSortVisibleRow[] | undefined,
  measuredTestCaseSlotCenters?: readonly number[],
  measuredWorkItemSlotCenters?: readonly number[]
): Metrics {
  const logicalTestCasePosition = visibleRows
    ? positionsFromVisibleRows(layout, visibleRows)
    : positionsFromFlatSuites(layout);
  const testCasePosition = new Map([...logicalTestCasePosition].map(([id, position]) => [id, measuredTestCaseSlotCenters?.[position] ?? position]));
  const workItemPosition = layout.workItemPositions
    ? new Map(Object.entries(layout.workItemPositions).map(([id, position]) => [Number(id), measuredWorkItemSlotCenters?.[position] ?? position]))
    : new Map(layout.workItemIds.map((id, index) => [id, measuredWorkItemSlotCenters?.[index] ?? index]));
  const edges = layout.workItemIds.flatMap((workItemId) => (workItems.get(workItemId)?.relatedTestCaseIds ?? [])
    .filter((testCaseId) => testCasePosition.has(testCaseId))
    .map((testCaseId) => ({
      left: testCasePosition.get(testCaseId)!,
      right: workItemPosition.get(workItemId)!
    }))
  );
  const crossings = edges.reduce((total, edge, index) => total + edges.slice(index + 1)
    .filter((other) => (edge.left - other.left) * (edge.right - other.right) < 0).length, 0);
  const length = edges.reduce((total, edge) => total + Math.abs(edge.left - edge.right), 0);
  return { crossings, length };
}

function considerFreeWorkItemSlots(
  current: MagicSortLayout,
  visibleRows: readonly MagicSortVisibleRow[] | undefined,
  workItems: ReadonlyMap<number, MagicSortWorkItem>,
  measuredWorkItemSlotCenters: readonly number[] | undefined,
  consider: (candidate: MagicSortLayout) => void
): void {
  const positions = current.workItemPositions!;
  const maximumPosition = Math.max(
    (measuredWorkItemSlotCenters?.length ?? 0) - 1,
    (visibleRows?.length ?? 0) - 1,
    ...Object.values(positions),
    current.workItemIds.length - 1
  );
  current.workItemIds.filter((workItemId) => hasVisibleRelation(workItems.get(workItemId))).forEach((workItemId) => {
    for (let position = 0; position <= maximumPosition; position += 1) {
      if (positions[workItemId] === position) {
        continue;
      }
      const occupiedId = Object.entries(positions).find(([candidateId, candidatePosition]) =>
        Number(candidateId) !== workItemId && candidatePosition === position
      )?.[0];
      const nextPositions = { ...positions, [workItemId]: position };
      if (occupiedId) {
        const occupiedWorkItemId = Number(occupiedId);
        if (hasVisibleRelation(workItems.get(occupiedWorkItemId))) {
          nextPositions[occupiedWorkItemId] = positions[workItemId]!;
        }
      }
      const compactedPositions = compactUnlinkedWorkItemPositions(
        current.workItemIds,
        nextPositions,
        workItems
      );
      consider({
        suites: current.suites,
        workItemIds: orderWorkItemsByPosition(current.workItemIds, compactedPositions),
        workItemPositions: compactedPositions
      });
    }
  });
}

function initialWorkItemPositions(
  workItemIds: readonly number[],
  storedPositions: Readonly<Record<number, number>> | undefined,
  workItems: ReadonlyMap<number, MagicSortWorkItem>
): Record<number, number> {
  const occupied = new Set<number>();
  const next: Record<number, number> = {};
  workItemIds.filter((id) => hasVisibleRelation(workItems.get(id))).forEach((id, index) => {
    const stored = storedPositions?.[id];
    const position = isSlotPosition(stored) && !occupied.has(stored)
      ? stored
      : nextFreePosition(occupied, index);
    next[id] = position;
    occupied.add(position);
  });
  return compactUnlinkedWorkItemPositions(workItemIds, next, workItems);
}

function compactUnlinkedWorkItemPositions(
  workItemIds: readonly number[],
  positions: Readonly<Record<number, number>>,
  workItems: ReadonlyMap<number, MagicSortWorkItem>
): Record<number, number> {
  const next = { ...positions };
  const occupied = new Set(
    workItemIds
      .filter((id) => hasVisibleRelation(workItems.get(id)))
      .map((id) => next[id])
      .filter(isSlotPosition)
  );
  let preferredPosition = 0;
  workItemIds.filter((id) => !hasVisibleRelation(workItems.get(id))).forEach((id) => {
    const position = nextFreePosition(occupied, preferredPosition);
    next[id] = position;
    occupied.add(position);
    preferredPosition = position + 1;
  });
  return next;
}

function hasVisibleRelation(workItem: MagicSortWorkItem | undefined): boolean {
  return (workItem?.relatedTestCaseIds.length ?? 0) > 0;
}

function isSlotPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function nextFreePosition(occupied: ReadonlySet<number>, preferred: number): number {
  let position = preferred;
  while (occupied.has(position)) {
    position += 1;
  }
  return position;
}

function orderWorkItemsByPosition(
  ids: readonly number[],
  positions: Readonly<Record<number, number>>
): number[] {
  const indexById = new Map(ids.map((id, index) => [id, index]));
  return ids.slice().sort((left, right) => (positions[left] ?? 0) - (positions[right] ?? 0)
    || (indexById.get(left) ?? 0) - (indexById.get(right) ?? 0));
}

function positionsFromFlatSuites(layout: MagicSortLayout): Map<number, number> {
  const positions = new Map<number, number>();
  layout.suites.flatMap((suite) => suite.testCaseIds).forEach((id, index) => positions.set(id, index));
  return positions;
}

function positionsFromVisibleRows(
  layout: MagicSortLayout,
  visibleRows: readonly MagicSortVisibleRow[]
): Map<number, number> {
  const remainingIdsBySuite = new Map(
    layout.suites.map((suite) => [suite.suiteId, [...suite.testCaseIds]])
  );
  const positions = new Map<number, number>();
  visibleRows.forEach((row, position) => {
    if (row.kind !== "test-case") {
      return;
    }
    const nextId = remainingIdsBySuite.get(row.suiteId)?.shift();
    if (nextId !== undefined) {
      positions.set(nextId, position);
    }
  });
  return positions;
}

function dominates(candidate: Metrics, current: Metrics): boolean {
  return candidate.crossings <= current.crossings && candidate.length <= current.length && (
    candidate.crossings < current.crossings || candidate.length < current.length
  );
}

function compareMetrics(a: Metrics, b: Metrics): number {
  return a.crossings - b.crossings || a.length - b.length;
}

function swapAt(ids: readonly number[], index: number): number[] {
  const next = [...ids];
  const current = next[index]!;
  next[index] = next[index + 1]!;
  next[index + 1] = current;
  return next;
}
