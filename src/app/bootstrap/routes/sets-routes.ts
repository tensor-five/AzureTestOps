import type { IncomingMessage, ServerResponse } from "node:http";

import { createSet } from "../../../application/use-cases/create-set.use-case.js";
import { deleteSet } from "../../../application/use-cases/delete-set.use-case.js";
import { listSets } from "../../../application/use-cases/list-sets.use-case.js";
import { setActiveSet } from "../../../application/use-cases/set-active-set.use-case.js";
import { updateSet } from "../../../application/use-cases/update-set.use-case.js";
import type { SetRepositoryPort } from "../../../application/ports/set-repository.port.js";
import type { SetDraft } from "../../../domain/sets/set.js";

import { errorPayload, parseJsonBody, readBody, writeJson } from "./route-helpers.js";

export type SetsRouter = (
  method: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

const SETS_BASE = "/phase2/sets";
const ACTIVE_SET_PATH = "/phase2/active-set";
const SET_ID_PATTERN = /^\/phase2\/sets\/([A-Za-z0-9_\-:.]+)$/;

/**
 * REST resource for {@link Set} CRUD plus the active-set pointer.
 *
 *   GET    /phase2/sets               → { sets, activeSetId }
 *   POST   /phase2/sets               → { set } (body: SetDraft + setActive?)
 *   PATCH  /phase2/sets/:id           → { set } (body: Partial<SetDraft>)
 *   DELETE /phase2/sets/:id           → { status: "OK" }
 *   POST   /phase2/active-set         → { activeSetId } (body: { setId: string | null })
 *
 * All write endpoints are CSRF-protected by the outer router.
 */
export function registerSetRoutes(setRepository: SetRepositoryPort): SetsRouter {
  return async (method, pathname, req, res) => {
    if (pathname === SETS_BASE) {
      if (method === "GET") {
        try {
          const result = await listSets({ setRepository });
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, errorPayload(error, "SETS_LIST_FAILED"));
        }
        return true;
      }
      if (method === "POST") {
        await handleCreate(req, res, setRepository);
        return true;
      }
      writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." });
      return true;
    }

    if (pathname === ACTIVE_SET_PATH && method === "POST") {
      await handleSetActive(req, res, setRepository);
      return true;
    }

    const idMatch = pathname.match(SET_ID_PATTERN);
    if (idMatch) {
      const setId = idMatch[1];
      if (method === "PATCH") {
        await handleUpdate(req, res, setRepository, setId);
        return true;
      }
      if (method === "DELETE") {
        await handleDelete(res, setRepository, setId);
        return true;
      }
      writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use PATCH or DELETE." });
      return true;
    }

    return false;
  };
}

async function handleCreate(
  req: IncomingMessage,
  res: ServerResponse,
  setRepository: SetRepositoryPort
): Promise<void> {
  const body = parseJsonBody(await readBody(req));
  const parsed = parseCreatePayload(body);
  if (!parsed) {
    writeJson(res, 400, {
      code: "INVALID_INPUT",
      message: "Provide name, planId, rootSuiteId and queryId as non-empty strings."
    });
    return;
  }
  try {
    const set = await createSet(parsed, { setRepository });
    writeJson(res, 201, { set });
  } catch (error) {
    writeJson(res, 400, errorPayload(error, "SETS_CREATE_FAILED"));
  }
}

async function handleUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  setRepository: SetRepositoryPort,
  setId: string
): Promise<void> {
  const body = parseJsonBody(await readBody(req));
  const patch = parseUpdatePayload(body);
  if (!patch) {
    writeJson(res, 400, {
      code: "INVALID_INPUT",
      message: "Provide a Partial<SetDraft> body with at least one editable field."
    });
    return;
  }
  try {
    const set = await updateSet({ setId, patch }, { setRepository });
    writeJson(res, 200, { set });
  } catch (error) {
    writeJson(res, 400, errorPayload(error, "SETS_UPDATE_FAILED"));
  }
}

async function handleDelete(
  res: ServerResponse,
  setRepository: SetRepositoryPort,
  setId: string
): Promise<void> {
  try {
    await deleteSet({ setId }, { setRepository });
    writeJson(res, 200, { status: "OK" });
  } catch (error) {
    writeJson(res, 400, errorPayload(error, "SETS_DELETE_FAILED"));
  }
}

async function handleSetActive(
  req: IncomingMessage,
  res: ServerResponse,
  setRepository: SetRepositoryPort
): Promise<void> {
  const body = parseJsonBody(await readBody(req));
  if (!body || typeof body !== "object") {
    writeJson(res, 400, { code: "INVALID_INPUT", message: "Provide { setId: string | null }." });
    return;
  }
  const candidate = body as { setId?: unknown };
  if (candidate.setId !== null && typeof candidate.setId !== "string") {
    writeJson(res, 400, { code: "INVALID_INPUT", message: "setId must be a string or null." });
    return;
  }
  const setId = candidate.setId === null ? null : candidate.setId.trim() || null;
  try {
    await setActiveSet({ setId }, { setRepository });
    writeJson(res, 200, { activeSetId: setId });
  } catch (error) {
    writeJson(res, 400, errorPayload(error, "ACTIVE_SET_FAILED"));
  }
}

function parseCreatePayload(
  payload: unknown
): (SetDraft & { setActive?: boolean }) | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const c = payload as Record<string, unknown>;
  const name = readString(c.name);
  const planId = readString(c.planId);
  const rootSuiteId = readString(c.rootSuiteId);
  const queryId = readString(c.queryId);
  if (!name || !planId || !rootSuiteId || !queryId) {
    return null;
  }
  const next: SetDraft & { setActive?: boolean } = {
    name,
    planId,
    rootSuiteId,
    queryId
  };
  const planName = readString(c.planName);
  if (planName) next.planName = planName;
  const rootSuiteName = readString(c.rootSuiteName);
  if (rootSuiteName) next.rootSuiteName = rootSuiteName;
  const queryName = readString(c.queryName);
  if (queryName) next.queryName = queryName;
  const organization = readString(c.organization);
  if (organization) next.organization = organization;
  const project = readString(c.project);
  if (project) next.project = project;
  if (typeof c.setActive === "boolean") next.setActive = c.setActive;
  return next;
}

function parseUpdatePayload(payload: unknown): Partial<SetDraft> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const c = payload as Record<string, unknown>;
  const patch: Partial<SetDraft> = {};
  const fields: Array<keyof SetDraft> = [
    "name",
    "planId",
    "planName",
    "rootSuiteId",
    "rootSuiteName",
    "queryId",
    "queryName",
    "organization",
    "project"
  ];
  for (const field of fields) {
    const raw = c[field];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        patch[field] = trimmed;
      }
    }
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
