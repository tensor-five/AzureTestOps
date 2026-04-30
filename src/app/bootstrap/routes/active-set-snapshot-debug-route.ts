import type { IncomingMessage, ServerResponse } from "node:http";

import { loadActiveSetSnapshot } from "../../../application/use-cases/load-active-set-snapshot.use-case.js";
import type { AdoContextPort } from "../../../application/ports/ado-context.port.js";
import type { SetRepositoryPort } from "../../../application/ports/set-repository.port.js";
import type { ActiveSetSnapshot } from "../../../application/dto/active-set-snapshot.dto.js";
import type { TestCaseProjection } from "../../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../../domain/work-items/work-item.js";
import type { AdoRuntime } from "../../composition/runtime.js";

import { errorPayload, writeJson } from "./route-helpers.js";

const DEBUG_PATH = "/phase2/active-set/snapshot/debug";

export type ActiveSetSnapshotDebugRouter = (
  method: string,
  pathname: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

export type ActiveSetSnapshotDebugRouteDeps = {
  ado: AdoRuntime;
  setRepository: SetRepositoryPort;
  adoContext: AdoContextPort;
};

/**
 * Diagnostic JSON view of the current `loadActiveSetSnapshot` output.
 *
 * Why this exists: the SSE stream is not browser-console-friendly for
 * one-off introspection. This endpoint returns a slimmed JSON snapshot so
 * a developer can verify, without instrumenting client code, whether
 * `relatedIds` are extracted, whether a specific work item is hydrated, and
 * whether the (testCaseId, workItemId) pair would render a line.
 *
 * Query params:
 *   - `setId`   optional set id; defaults to the persisted active set
 *   - `tcId`    optional test-case work-item id to focus on
 *   - `wiId`    optional bug / work-item id to focus on
 *   - `full=1`  optional flag to dump the full projections + work items
 */
export function registerActiveSetSnapshotDebugRoute(
  deps: ActiveSetSnapshotDebugRouteDeps
): ActiveSetSnapshotDebugRouter {
  return async (method, pathname, url, _req, res) => {
    if (pathname !== DEBUG_PATH) {
      return false;
    }
    if (method !== "GET") {
      writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use GET." });
      return true;
    }

    const setId = url.searchParams.get("setId");
    const tcId = parseOptionalId(url.searchParams.get("tcId"));
    const wiId = parseOptionalId(url.searchParams.get("wiId"));
    const includeFull = url.searchParams.get("full") === "1";

    try {
      const snapshot = await loadActiveSetSnapshot(
        setId ? { setId } : {},
        {
          setRepository: deps.setRepository,
          adoContext: deps.adoContext,
          testManagement: await deps.ado.testManagement(),
          workItemHydration: await deps.ado.workItemHydration(),
          savedQuery: await deps.ado.savedQuery()
        }
      );

      writeJson(res, 200, buildDebugPayload(snapshot, { tcId, wiId, includeFull }));
    } catch (error) {
      writeJson(res, 500, errorPayload(error, "SNAPSHOT_DEBUG_FAILED"));
    }
    return true;
  };
}

type DebugFocus = {
  tcId: number | null;
  wiId: number | null;
  includeFull: boolean;
};

type ProjectionDigest = {
  workItemId: number;
  suiteId: number;
  suitePath: string;
  title: string;
  state: string;
  workItemType: string;
  relatedIds: number[];
};

type WorkItemDigest = {
  id: number;
  workItemType: string;
  title: string;
  state: string;
  relatedIds: number[];
};

function buildDebugPayload(snapshot: ActiveSetSnapshot, focus: DebugFocus): unknown {
  const projectionsForTc = focus.tcId === null
    ? []
    : snapshot.projections
        .filter((p) => p.workItemId === focus.tcId)
        .map(toProjectionDigest);
  const workItem = focus.wiId === null
    ? null
    : snapshot.workItemsFromQuery.find((wi) => wi.id === focus.wiId) ?? null;

  const linkage = focus.tcId !== null && focus.wiId !== null
    ? buildLinkageReport(snapshot, focus.tcId, focus.wiId)
    : null;

  return {
    set: {
      id: snapshot.set.id,
      name: snapshot.set.name,
      planId: snapshot.set.planId,
      rootSuiteId: snapshot.set.rootSuiteId,
      queryId: snapshot.set.queryId
    },
    loadedAt: snapshot.loadedAt,
    counts: {
      projections: snapshot.projections.length,
      uniqueTestCaseIds: countUnique(snapshot.projections.map((p) => p.workItemId)),
      workItemsFromQuery: snapshot.workItemsFromQuery.length,
      projectionsWithRelatedIds: snapshot.projections.filter((p) => p.relatedIds.length > 0).length,
      workItemsWithRelatedIds: snapshot.workItemsFromQuery.filter((wi) => wi.relatedIds.length > 0).length
    },
    focus: {
      testCase: focus.tcId === null
        ? null
        : {
            workItemId: focus.tcId,
            occurrences: projectionsForTc,
            occurrenceCount: projectionsForTc.length
          },
      workItem: focus.wiId === null
        ? null
        : {
            id: focus.wiId,
            found: workItem !== null,
            digest: workItem ? toWorkItemDigest(workItem) : null
          },
      linkage
    },
    full: focus.includeFull
      ? {
          projections: snapshot.projections.map(toProjectionDigest),
          workItemsFromQuery: snapshot.workItemsFromQuery.map(toWorkItemDigest)
        }
      : undefined
  };
}

function buildLinkageReport(
  snapshot: ActiveSetSnapshot,
  tcId: number,
  wiId: number
): {
  testCaseHasWorkItemInRelatedIds: boolean;
  workItemHasTestCaseInRelatedIds: boolean;
  workItemPresentInQuery: boolean;
  testCasePresentInProjections: boolean;
  wouldRenderLine: boolean;
} {
  const projections = snapshot.projections.filter((p) => p.workItemId === tcId);
  const workItem = snapshot.workItemsFromQuery.find((wi) => wi.id === wiId) ?? null;

  const testCaseHasWorkItem = projections.some((p) => p.relatedIds.includes(wiId));
  const workItemHasTestCase = workItem ? workItem.relatedIds.includes(tcId) : false;
  const workItemPresentInQuery = workItem !== null;
  const testCasePresentInProjections = projections.length > 0;

  return {
    testCaseHasWorkItemInRelatedIds: testCaseHasWorkItem,
    workItemHasTestCaseInRelatedIds: workItemHasTestCase,
    workItemPresentInQuery,
    testCasePresentInProjections,
    wouldRenderLine:
      testCasePresentInProjections &&
      workItemPresentInQuery &&
      (testCaseHasWorkItem || workItemHasTestCase)
  };
}

function toProjectionDigest(projection: TestCaseProjection): ProjectionDigest {
  return {
    workItemId: projection.workItemId,
    suiteId: projection.suiteId,
    suitePath: projection.suitePath,
    title: projection.title,
    state: projection.state,
    workItemType: projection.workItemType,
    relatedIds: projection.relatedIds.slice()
  };
}

function toWorkItemDigest(workItem: WorkItem): WorkItemDigest {
  return {
    id: workItem.id,
    workItemType: workItem.workItemType,
    title: workItem.title,
    state: workItem.state,
    relatedIds: workItem.relatedIds.slice()
  };
}

function countUnique(values: readonly number[]): number {
  return new Set(values).size;
}

function parseOptionalId(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
