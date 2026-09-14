import type { ManualOutcome } from '../../domain/release-matrix/matrix-config.js';
export interface TestExecutionPort {
  createManualRun(planId: number, pointId: number): Promise<number>;
  completeResult(runId: number, resultId: number, outcome: ManualOutcome): Promise<void>;
  completeRun(runId: number): Promise<void>;
}
