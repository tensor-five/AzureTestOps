/**
 * Lightweight summary of a Test Plan, surfaced to the Set-creation UI.
 *
 * Identifiers are kept numeric here (matching the Azure REST shape) — the
 * Set persistence layer string-ifies them at the boundary.
 */
export type TestPlanSummary = {
  id: number;
  name: string;
  areaPath: string | null;
  iterationPath: string | null;
};

/** Lightweight suite descriptor for plan/suite pickers. */
export type TestSuiteSummary = {
  id: number;
  name: string;
  parentSuiteId: number | null;
  suiteType: string | null;
};
