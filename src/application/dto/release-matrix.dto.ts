import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import type { TestSuiteFlatEntry } from '../../domain/test-management/test-suite-tree.js';
import type { ManualOutcome } from '../../domain/release-matrix/matrix-config.js';
import type { TestResult } from '../../domain/test-management/test-result.js';
/** Result identity before the outcome aggregator combines result and point data. */
export type MatrixResultEvidence = Pick<TestResult, 'resultId' | 'runId' | 'workItemId' | 'suiteId' | 'pointId' | 'outcome' | 'completedDate'>;
export type MatrixData = {
  planId: number; suites: Array<TestSuiteFlatEntry & { suiteType: string | null }>;
  projections: TestCaseProjection[]; pointCounts: Record<string, number>;
  /** Explicit run completion from the same read; absent in older snapshots means unconfirmed. */
  completedRunIds?: number[];
  /** Raw result identities for the currently projected run/case pairs; absent means unconfirmed. */
  resultEvidence?: MatrixResultEvidence[];
  /** Physical points freshly confirmed Ready/Active, with cleared execution references. */
  activePoints?: Array<{ pointId: number; suiteId: number; workItemId: number }>;
};
export type MatrixSnapshot = MatrixData & { contextIdentity: string };
export type MatrixOutcomeTarget = { planId: number; suiteId: number; workItemId: number; pointId: number; outcome: ManualOutcome };
export type MatrixResetTarget = Omit<MatrixOutcomeTarget, 'outcome'> & { outcome: 'ResetToActive' };
export type MatrixWrite = (MatrixOutcomeTarget | MatrixResetTarget) & { contextIdentity: string };
export type MatrixWriteResult = { runId: number; projection: TestCaseProjection };
export type MatrixResetResult = { runId: null; resetToActive: true; projection: TestCaseProjection };
export type MatrixActionResult = MatrixWriteResult | MatrixResetResult;
