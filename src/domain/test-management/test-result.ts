import type { Outcome } from "./outcome.js";

/**
 * Domain-side projection of an Azure DevOps Test Result. Carries enough
 * information to identify which (workItemId, suiteId, pointId) it belongs to
 * and when it completed — that's everything the OutcomeAggregator needs.
 */
export type TestResult = {
  resultId: number;
  runId: number;
  /** Test Case Work Item id (`testCase.id`, not `testCaseReferenceId` — those diverge in ADO). */
  workItemId: number;
  suiteId: number | null;
  pointId: number | null;
  outcome: Outcome;
  /** ISO timestamp; missing or unparseable values bubble up as null. */
  completedDate: string | null;
};
