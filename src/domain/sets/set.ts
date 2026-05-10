/**
 * A Set bundles "what to compare" into one switchable unit: a Test Plan
 * (with one root Test Suite, recursive) plus a Saved Query that drives the
 * right-hand work-item column.
 *
 * Identifiers are kept as strings end-to-end (lowdb / wire / DOM-friendly);
 * the `LoadActiveSetSnapshot` use case parses planId / rootSuiteId into
 * numbers at the boundary to the Azure adapters.
 *
 * The cross-context `ActiveSetSnapshot` read model lives in
 * `application/dto/active-set-snapshot.dto.ts` so this domain stays free of
 * Test Management and Work Items types.
 */
export type Set = {
  id: string;
  name: string;
  planId: string;
  planName?: string;
  rootSuiteId: string;
  rootSuiteName?: string;
  queryId: string;
  queryName?: string;
  /** Optional ADO context override; defaults from the persisted user preference. */
  organization?: string;
  project?: string;
};

export type SetDraft = Omit<Set, "id">;
