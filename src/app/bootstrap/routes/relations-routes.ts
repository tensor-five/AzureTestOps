import type { IncomingMessage, ServerResponse } from "node:http";

import { createRelation } from "../../../application/use-cases/create-relation.use-case.js";
import { deleteRelation } from "../../../application/use-cases/delete-relation.use-case.js";
import type { AdoRuntime } from "../../composition/runtime.js";

import { errorPayload, parseJsonBody, readBody, writeJson } from "./route-helpers.js";

export type RelationsRouter = (
  method: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

const RELATIONS_PATH = "/phase2/relations";

/**
 * Live edit endpoint for `System.LinkTypes.Related` links.
 *
 *   POST   /phase2/relations  → adds a relation     (body: { sourceId, targetId })
 *   DELETE /phase2/relations  → removes a relation  (body: { sourceId, targetId })
 *
 * Both writes are CSRF-protected by the outer router. The use cases keep the
 * adapter idempotent (`RelationAlreadyExists` on add and missing relation on
 * remove both resolve as success), so the UI can replay a request after a
 * transient failure without surfacing spurious errors.
 *
 * DELETE-with-body is used because the relation is identified by a pair of
 * ids; encoding both in the URL would force `?source=...&target=...` and lose
 * symmetry with the POST shape consumed by the same UI mutation hook.
 */
export function registerRelationsRoutes(ado: AdoRuntime): RelationsRouter {
  return async (method, pathname, req, res) => {
    if (pathname !== RELATIONS_PATH) {
      return false;
    }

    if (method !== "POST" && method !== "DELETE") {
      writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use POST or DELETE." });
      return true;
    }

    const link = parseRelationPayload(parseJsonBody(await readBody(req)));
    if (!link) {
      writeJson(res, 400, {
        code: "INVALID_INPUT",
        message: "Provide { sourceId: number, targetId: number } as positive integers."
      });
      return true;
    }

    try {
      const relations = await ado.relations();
      if (method === "POST") {
        await createRelation(link, { relations });
      } else {
        await deleteRelation(link, { relations });
      }
      writeJson(res, 200, { status: "OK" });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "ADO_CONTEXT_NOT_CONFIGURED"
      ) {
        writeJson(res, 412, {
          code: "ADO_CONTEXT_NOT_CONFIGURED",
          message: "Configure organization and project under /phase2/ado-context first."
        });
        return true;
      }
      writeJson(
        res,
        500,
        errorPayload(error, method === "POST" ? "RELATION_CREATE_FAILED" : "RELATION_DELETE_FAILED")
      );
    }
    return true;
  };
}

function parseRelationPayload(
  payload: unknown
): { sourceWorkItemId: number; targetWorkItemId: number } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const c = payload as { sourceId?: unknown; targetId?: unknown };
  const source = readPositiveInt(c.sourceId);
  const target = readPositiveInt(c.targetId);
  if (source === null || target === null || source === target) {
    return null;
  }
  return { sourceWorkItemId: source, targetWorkItemId: target };
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
