import type { TestManagementReadPort } from '../ports/test-management.port.js';
import { mapConcurrent } from '../../shared/utils/concurrency.js';
import type { PlanTestResults, TestResultHistoryPort } from '../ports/test-result-history.port.js';

/** Preserve the established latest-per-suite/case history, including earlier physical points. */
export async function loadPlanTestResults(planId: number, hasCases: boolean,
  deps: { testManagement: TestManagementReadPort; testResultHistory?: TestResultHistoryPort; concurrency?: number; signal?: AbortSignal }): Promise<PlanTestResults> {
  deps.signal?.throwIfAborted();
  const freshness = { sourceReadAt: new Date().toISOString(), cacheUsed: false };
  if (!hasCases) return { runs: [], results: [], freshness };
  if (deps.testResultHistory) return deps.testResultHistory.loadPlanResults(planId, deps);
  const runs = await deps.testManagement.listRunsForPlan(planId, deps.signal);
  const results = await mapConcurrent(runs, deps.concurrency ?? 8,
    run => deps.testManagement.loadResultsForRun(run.runId, deps.signal), deps.signal);
  return { runs, results: results.flat(), freshness };
}
