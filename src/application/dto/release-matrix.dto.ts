import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import type { TestSuiteFlatEntry } from '../../domain/test-management/test-suite-tree.js';
import type { ManualOutcome } from '../../domain/release-matrix/matrix-config.js';
export type MatrixData = {
  planId: number; suites: Array<TestSuiteFlatEntry & { suiteType: string | null; tags: string[] }>;
  projections: TestCaseProjection[]; pointCounts: Record<string, number>;
};
export type MatrixSnapshot = MatrixData & { contextIdentity: string };
export type MatrixOutcomeTarget = { planId: number; suiteId: number; workItemId: number; pointId: number; outcome: ManualOutcome };
export type MatrixWrite = MatrixOutcomeTarget & { contextIdentity: string };
export type MatrixWriteResult = { runId: number; projection: TestCaseProjection };
