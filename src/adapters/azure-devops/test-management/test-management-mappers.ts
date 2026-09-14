import type { TestPoint } from "../../../domain/test-management/test-point.js";
import type { TestRun } from "../../../domain/test-management/test-run.js";
import type { TestResult } from "../../../domain/test-management/test-result.js";

export function toTestPoint(value: unknown, fallbackSuiteId: number): TestPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const pointId = readNumber(candidate.id);
  const workItemId = readNumber((candidate.testCase as { id?: unknown } | undefined)?.id);
  if (pointId === null || workItemId === null) {
    return null;
  }

  const configuration = (candidate.configuration ?? {}) as Record<string, unknown>;
  const lastRun = (candidate.lastTestRun ?? {}) as Record<string, unknown>;
  const lastResult = (candidate.lastResult ?? {}) as Record<string, unknown>;

  const directOutcome = typeof candidate.outcome === "string" ? candidate.outcome : null;
  const lastResultOutcome = typeof lastResult.outcome === "string" ? lastResult.outcome : null;

  return {
    pointId,
    workItemId,
    suiteId: fallbackSuiteId,
    configurationId: readNumber(configuration.id),
    configurationName: typeof configuration.name === "string" ? configuration.name : null,
    lastRunId: readNumber(lastRun.id),
    lastResultId: readNumber(lastResult.id),
    lastOutcome: directOutcome ?? lastResultOutcome,
    pointState: typeof candidate.state === 'string' ? candidate.state : null,
    lastResetToActive: typeof candidate.lastResetToActive === 'string' ? candidate.lastResetToActive : null
  };
}

export function toTestRun(value: unknown, requestedPlanId: number | null = null): TestRun | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const runId = readNumber(candidate.id);
  // Compact runs may omit the plan; the request already filters it server-side.
  const planId = candidate.plan == null
    ? requestedPlanId
    : readNumber((candidate.plan as { id?: unknown }).id);
  if (runId === null || planId === null) {
    return null;
  }

  return {
    runId,
    planId,
    name: typeof candidate.name === "string" ? candidate.name : `Run ${runId}`,
    state: typeof candidate.state === "string" ? candidate.state : "",
    startedDate: typeof candidate.startedDate === "string" ? candidate.startedDate : null,
    completedDate: typeof candidate.completedDate === "string" ? candidate.completedDate : null,
    totalTests: readNumber(candidate.totalTests) ?? 0,
    passedTests: readNumber(candidate.passedTests) ?? 0,
    isAutomated: candidate.isAutomated === true
  };
}

export function toTestResult(value: unknown): TestResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const resultId = readNumber(candidate.id);
  const runId = readNumber((candidate.testRun as { id?: unknown } | undefined)?.id);
  // testCase.id is the Work Item ID; testCaseReferenceId is an internal ref. Prefer the former.
  const workItemId =
    readNumber((candidate.testCase as { id?: unknown } | undefined)?.id) ??
    readNumber(candidate.testCaseReferenceId);
  if (resultId === null || runId === null || workItemId === null) {
    return null;
  }

  return {
    resultId,
    runId,
    workItemId,
    suiteId: readNumber((candidate.testSuite as { id?: unknown } | undefined)?.id),
    pointId: readNumber((candidate.testPoint as { id?: unknown } | undefined)?.id),
    outcome: typeof candidate.outcome === "string" ? candidate.outcome : "Unspecified",
    completedDate: typeof candidate.completedDate === "string" ? candidate.completedDate : null,
    ...(typeof candidate.state === 'string' ? { state: candidate.state } : {})
  };
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
