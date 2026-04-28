/**
 * Test result outcome as exposed by Azure DevOps. Treat as opaque string for
 * unknown values — the well-known list lets call-sites get autocompletion
 * while still tolerating future additions on the API side.
 */
export type KnownOutcome =
  | "Passed"
  | "Failed"
  | "NotRun"
  | "Blocked"
  | "NotApplicable"
  | "Paused"
  | "Inconclusive"
  | "InProgress"
  | "Warning"
  | "Error"
  | "Aborted"
  | "Timeout"
  | "Unspecified";

export type Outcome = KnownOutcome | (string & {});

/**
 * Signals "no result has been recorded yet" — the OutcomeAggregator emits
 * this as the default when no matching result exists for a (workItemId, suiteId).
 */
export const NOT_RUN: Outcome = "NotRun";

export function isPassed(outcome: Outcome): boolean {
  return outcome === "Passed";
}

export function isFailed(outcome: Outcome): boolean {
  return outcome === "Failed";
}

export function isNotRun(outcome: Outcome): boolean {
  return outcome === "NotRun" || outcome.length === 0;
}
