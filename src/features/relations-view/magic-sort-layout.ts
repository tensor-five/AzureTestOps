export type MagicSortSuite = {
  suiteId: number;
  testCaseIds: readonly number[];
};

export type MagicSortWorkItem = {
  id: number;
  relatedTestCaseIds: readonly number[];
};

export type MagicSortInput = {
  suites: readonly MagicSortSuite[];
  workItemIds: readonly number[];
  workItems: readonly MagicSortWorkItem[];
};

export type MagicSortLayout = {
  suites: readonly MagicSortSuite[];
  workItemIds: readonly number[];
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
  let current: MagicSortLayout = {
    suites: input.suites.map((suite) => ({ ...suite, testCaseIds: [...suite.testCaseIds] })),
    workItemIds: [...input.workItemIds]
  };
  const workItems = new Map(input.workItems.map((workItem) => [workItem.id, workItem]));
  const steps: MagicSortLayout[] = [current];

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const next = findBestImprovement(current, workItems);
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
  workItems: ReadonlyMap<number, MagicSortWorkItem>
): MagicSortLayout | null {
  const currentMetrics = measure(current, workItems);
  let best: MagicSortLayout | null = null;
  let bestMetrics: Metrics | null = null;

  const consider = (candidate: MagicSortLayout) => {
    const metrics = measure(candidate, workItems);
    if (!dominates(metrics, currentMetrics)) {
      return;
    }
    if (!bestMetrics || compareMetrics(metrics, bestMetrics) < 0) {
      best = candidate;
      bestMetrics = metrics;
    }
  };

  for (let index = 0; index < current.workItemIds.length - 1; index += 1) {
    consider({
      suites: current.suites,
      workItemIds: swapAt(current.workItemIds, index)
    });
  }
  for (let suiteIndex = 0; suiteIndex < current.suites.length; suiteIndex += 1) {
    const suite = current.suites[suiteIndex]!;
    for (let index = 0; index < suite.testCaseIds.length - 1; index += 1) {
      consider({
        workItemIds: current.workItemIds,
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

function measure(layout: MagicSortLayout, workItems: ReadonlyMap<number, MagicSortWorkItem>): Metrics {
  const testCasePosition = new Map<number, number>();
  layout.suites.flatMap((suite) => suite.testCaseIds).forEach((id, index) => testCasePosition.set(id, index));
  const workItemPosition = new Map<number, number>();
  layout.workItemIds.forEach((id, index) => workItemPosition.set(id, index));
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
