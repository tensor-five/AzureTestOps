import type { TestExecutionPort } from '../../../application/ports/test-execution.port.js';
import type { TestPointResetPort } from '../../../application/ports/test-point-reset.port.js';

/** Every transport write attempt fences old readers, even when its result cannot be confirmed. */
export function historyInvalidatingTestWrites(execution: TestExecutionPort, pointReset: TestPointResetPort,
  beginWrite: (planId?: number) => () => void): { execution: TestExecutionPort; pointReset: TestPointResetPort } {
  const attempt = async <T>(planId: number | undefined, write: () => Promise<T>): Promise<T> => {
    const finish = beginWrite(planId);
    try { return await write(); }
    finally { finish(); }
  };
  return {
    execution: {
      createManualRun: (planId, pointId) => attempt(planId, () => execution.createManualRun(planId, pointId)),
      completeResult: (runId, resultId, outcome) => attempt(undefined, () => execution.completeResult(runId, resultId, outcome)),
      completeRun: runId => attempt(undefined, () => execution.completeRun(runId))
    },
    pointReset: { resetToActive: (planId, suiteId, pointId) => attempt(planId, () => pointReset.resetToActive(planId, suiteId, pointId)) }
  };
}
