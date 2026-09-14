import type { MatrixOutcomeTarget } from '../dto/release-matrix.dto.js';
import type { TestOutcomeReadPort } from '../ports/test-outcome-read.port.js';

export type OutcomePointTarget = Omit<MatrixOutcomeTarget, 'outcome'>;
/** Await every independent read before reporting a failure; no reads outlive the operation. */
export async function settleOutcomeReads<T extends readonly unknown[]>(tasks: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const settled = await Promise.allSettled(tasks);
  for (const entry of settled) if (entry.status === 'rejected') throw entry.reason;
  return settled.map(entry => (entry as PromiseFulfilledResult<unknown>).value) as unknown as T;
}
export function validateOutcomeTargetIds(input: OutcomePointTarget): void {
  if (![input.planId, input.suiteId, input.workItemId, input.pointId].every(n => Number.isSafeInteger(n) && n > 0))
    throw new Error('Ungültiges Schreibziel.');
}
export async function readOutcomeTarget(input: OutcomePointTarget, read: TestOutcomeReadPort) {
  const [caseFound, loadedPoints] = await settleOutcomeReads([
    read.isCaseInSuite(input.planId, input.suiteId, input.workItemId),
    read.loadPointsForCase(input.planId, input.suiteId, input.workItemId),
  ] as const);
  const points = loadedPoints.filter(p => p.workItemId === input.workItemId && p.suiteId === input.suiteId);
  return { caseFound, points };
}
