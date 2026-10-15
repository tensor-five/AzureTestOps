export type TestRun = {
  runId: number;
  name: string;
  planId: number;
  state: string;
  startedDate: string | null;
  completedDate: string | null;
  totalTests: number;
  passedTests: number;
  isAutomated: boolean;
  /** Optional change markers returned when detailed run metadata is available. */
  revision?: number;
  lastUpdatedDate?: string;
};
