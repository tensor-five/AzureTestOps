import type { Outcome } from "./outcome.js";

/**
 * The central read model of the Test Cases ↔ Bugs view.
 *
 * One projection per `(workItemId, suiteId)` combination: the same Test Case
 * can live in several suites and the UI must show one row per occurrence.
 */
export type TestCaseProjection = {
  workItemId: number;
  suiteId: number;
  suitePath: string;
  // From the work item:
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string | null;
  tags: string[];
  areaPath: string | null;
  priority: number | null;
  relatedIds: number[];
  // From the test point (latest known):
  testPointId: number | null;
  configurationId: number | null;
  configurationName: string | null;
  // From the latest matching test result:
  lastOutcome: Outcome;
  lastResultId: number | null;
  lastResultCompletedDate: string | null;
  lastRunId: number | null;
};

export type TestCaseProjectionKey = `${number}::${number}`;

export function projectionKey(workItemId: number, suiteId: number): TestCaseProjectionKey {
  return `${workItemId}::${suiteId}`;
}
