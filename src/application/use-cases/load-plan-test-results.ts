import type { TestManagementReadPort } from '../ports/test-management.port.js';
import { mapConcurrent } from '../../shared/utils/concurrency.js';

/** Preserve the established latest-per-suite/case history, including earlier physical points. */
export async function loadPlanTestResults(planId: number, hasCases: boolean,
  deps: { testManagement: TestManagementReadPort; concurrency?: number; signal?: AbortSignal }) {
  deps.signal?.throwIfAborted();
  if (!hasCases) return { runs: [], results: [] };
  const runs = await deps.testManagement.listRunsForPlan(planId);
  const results = await mapConcurrent(runs, deps.concurrency ?? 8,
    run => deps.testManagement.loadResultsForRun(run.runId), deps.signal);
  return { runs, results: results.flat() };
}
