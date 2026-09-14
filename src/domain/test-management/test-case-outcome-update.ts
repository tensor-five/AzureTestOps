import type { TestCaseProjection } from './test-case-projection.js';

/** Only execution fields confirmed for one physical point; no membership or hydration data. */
export type TestCaseOutcomeUpdate = Pick<TestCaseProjection,
  'suiteId' | 'workItemId' | 'testPointId' | 'lastOutcome' | 'lastRunId' | 'lastResultId' | 'lastResultCompletedDate'>;
