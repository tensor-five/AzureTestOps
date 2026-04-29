import type { ActiveSetSnapshot, Set } from "../../domain/sets/set.js";
import type { AdoContextPort } from "../ports/ado-context.port.js";
import type { SavedQueryPort } from "../ports/saved-query.port.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";
import type { TestManagementReadPort } from "../ports/test-management.port.js";
import type { WorkItemHydrationPort } from "../ports/work-item-hydration.port.js";

import { loadTestCaseProjections } from "./load-test-case-projections.use-case.js";
import { runSavedQuery } from "./run-saved-query.use-case.js";

export type LoadActiveSetSnapshotInput = {
  /**
   * Override the active set. When omitted, the repository's active id is used;
   * the use case throws if neither is available.
   */
  setId?: string;
};

export type LoadActiveSetSnapshotDeps = {
  setRepository: SetRepositoryPort;
  testManagement: TestManagementReadPort;
  workItemHydration: WorkItemHydrationPort;
  savedQuery: SavedQueryPort;
  /** Optional fail-fast guard: throws when ADO context is not yet configured. */
  adoContext?: AdoContextPort;
  /** Forwarded to the underlying projections fan-out. Defaults to 8. */
  concurrency?: number;
  /** Injectable clock for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
};

/**
 * Composes Phase 2 (Test Management projections) and Phase 3 (Saved Query +
 * hydrated work items) into a single {@link ActiveSetSnapshot} for the active
 * Set. The snapshot is the read-side input for the RelationsView UI.
 *
 * Numeric parsing of `planId` / `rootSuiteId` happens here (one place, not in
 * every adapter), so the persistence layer can stay string-typed.
 */
export async function loadActiveSetSnapshot(
  input: LoadActiveSetSnapshotInput,
  deps: LoadActiveSetSnapshotDeps
): Promise<ActiveSetSnapshot> {
  if (deps.adoContext) {
    const context = await deps.adoContext.getContext();
    if (!context) {
      throw new AdoContextMissingError();
    }
  }

  const set = await resolveSet(input.setId, deps.setRepository);

  const planId = parsePositiveInt(set.planId, "planId", set.id);
  const rootSuiteId = parsePositiveInt(set.rootSuiteId, "rootSuiteId", set.id);

  const [testCaseLoad, queryRun] = await Promise.all([
    loadTestCaseProjections(
      { planId, rootSuiteId },
      {
        testManagement: deps.testManagement,
        workItemHydration: deps.workItemHydration,
        concurrency: deps.concurrency
      }
    ),
    runSavedQuery(
      { queryId: set.queryId },
      {
        savedQuery: deps.savedQuery,
        workItemHydration: deps.workItemHydration
      }
    )
  ]);

  const now = (deps.now ?? (() => new Date()))();

  return {
    set,
    suiteTree: testCaseLoad.suiteTree,
    projections: testCaseLoad.projections,
    workItemsFromQuery: queryRun.workItems,
    loadedAt: now.toISOString()
  };
}

async function resolveSet(
  requestedId: string | undefined,
  repository: SetRepositoryPort
): Promise<Set> {
  const id = (requestedId ?? (await repository.getActiveId()))?.trim();
  if (!id) {
    throw new NoActiveSetError();
  }
  const set = await repository.getById(id);
  if (!set) {
    throw new SetNotFoundError(id);
  }
  return set;
}

function parsePositiveInt(value: string, field: "planId" | "rootSuiteId", setId: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new InvalidSetIdentifierError(setId, field, value);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidSetIdentifierError(setId, field, value);
  }
  return parsed;
}

export class AdoContextMissingError extends Error {
  public readonly code = "ADO_CONTEXT_MISSING";
  public constructor() {
    super("Azure DevOps context (organization / project) is not configured.");
    this.name = "AdoContextMissingError";
  }
}

export class NoActiveSetError extends Error {
  public readonly code = "NO_ACTIVE_SET";
  public constructor() {
    super("No active Set selected and no setId provided.");
    this.name = "NoActiveSetError";
  }
}

export class SetNotFoundError extends Error {
  public readonly code = "SET_NOT_FOUND";
  public constructor(public readonly setId: string) {
    super(`Set "${setId}" not found.`);
    this.name = "SetNotFoundError";
  }
}

export class InvalidSetIdentifierError extends Error {
  public readonly code = "INVALID_SET_IDENTIFIER";
  public constructor(
    public readonly setId: string,
    public readonly field: "planId" | "rootSuiteId",
    public readonly value: string
  ) {
    super(`Set "${setId}" has an invalid ${field}: ${JSON.stringify(value)}.`);
    this.name = "InvalidSetIdentifierError";
  }
}
