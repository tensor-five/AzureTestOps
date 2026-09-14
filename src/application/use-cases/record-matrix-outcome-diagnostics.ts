export type MatrixWriteStage = 'validate-target' | 'create-run' | 'find-result' | 'complete-result' | 'complete-run' | 'confirm-run' | 'confirm-projection' | 'reset-point' | 'confirm-active-point';
type EventKind = 'start' | 'complete' | 'error';
type FieldName = 'planId' | 'suiteId' | 'workItemId' | 'pointId' | 'runId' | 'resultId'
    | 'caseCount' | 'pointCount' | 'resultCount' | 'matchingResultCount' | 'runCount' | 'projectionCount'
    | 'lastRunId' | 'lastResultId' | 'testPointId' | 'httpStatus'
    | 'caseFound' | 'runFound' | 'projectionFound' | 'pointMatches' | 'outcomeMatches' | 'runMatches' | 'resultMatches'
    | 'outcome' | 'lastOutcome' | 'runState';
export type MatrixWriteDiagnosticFields = Partial<Record<FieldName, unknown>>;
export interface MatrixWriteDiagnostics {
    event(entry: { stage: MatrixWriteStage; event: EventKind; fields: Record<string, number | boolean | string | null> }): void;
}

const numericFields = new Set<FieldName>(['planId', 'suiteId', 'workItemId', 'pointId', 'runId', 'resultId', 'caseCount', 'pointCount', 'resultCount', 'matchingResultCount', 'runCount', 'projectionCount', 'lastRunId', 'lastResultId', 'testPointId', 'httpStatus']);
const booleanFields = new Set<FieldName>(['caseFound', 'runFound', 'projectionFound', 'pointMatches', 'outcomeMatches', 'runMatches', 'resultMatches']);
const outcomes = new Set(['Passed', 'Failed', 'Blocked', 'NotApplicable', 'Inconclusive', 'Unspecified', 'NotRun', 'Paused', 'ResetToActive']);
const states = new Set(['Unspecified', 'NotStarted', 'InProgress', 'Waiting', 'Completed', 'Aborted', 'NeedsInvestigation']);

/** A fixed allowlist keeps diagnostics independent of credentials and Azure text. */
export function createOutcomeDiagnostics(sink?: MatrixWriteDiagnostics) {
    return (stage: MatrixWriteStage, event: EventKind, source: MatrixWriteDiagnosticFields, error?: unknown): void => {
        if (!sink) return;
        try {
            const fields: Record<string, number | boolean | string | null> = {};
            for (const key of Object.keys(source) as FieldName[]) {
                const value = source[key];
                if (numericFields.has(key)) {
                    if (value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) fields[key] = value;
                } else if (booleanFields.has(key)) {
                    if (typeof value === 'boolean') fields[key] = value;
                } else if (key === 'outcome' || key === 'lastOutcome') {
                    fields[key] = typeof value === 'string' && outcomes.has(value) ? value : 'Unknown';
                } else if (key === 'runState') {
                    fields[key] = typeof value === 'string' && states.has(value) ? value : 'Unknown';
                }
            }
            if (error instanceof Error) {
                const match = /^(?:Azure konnte den Testlauf nicht speichern \(HTTP ([1-5]\d{2})\)\.|(?:SUITE_TREE|TEST_CASES|POINTS|RUNS|RESULTS|POINT_RESET)_HTTP_([1-5]\d{2}))$/.exec(error.message);
                if (match) fields.httpStatus = Number(match[1] ?? match[2]);
            }
            sink.event({ stage, event, fields });
        } catch {
            // Diagnostic failures must never change Azure writes or their confirmation.
        }
    };
}
