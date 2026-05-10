import type { IncomingMessage, ServerResponse } from "node:http";

import type { AdoContextPort } from "../../../application/ports/ado-context.port.js";

import { errorPayload, parseJsonBody, readBody, writeJson } from "./route-helpers.js";

export type AdoContextRouter = (
  method: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

/**
 * Exposes the ADO context (org/project) as a thin REST resource. GET returns
 * `{ context: AdoContext | null }`; POST replaces it (CSRF-protected by the
 * outer router).
 */
export function registerAdoContextRoutes(adoContext: AdoContextPort): AdoContextRouter {
  return async (method, pathname, req, res) => {
    if (pathname !== "/phase2/ado-context") {
      return false;
    }

    if (method === "GET") {
      try {
        const context = await adoContext.getContext();
        writeJson(res, 200, { context });
      } catch (error) {
        writeJson(res, 500, errorPayload(error, "ADO_CONTEXT_READ_FAILED"));
      }
      return true;
    }

    if (method === "POST") {
      const payload = parseJsonBody(await readBody(req));
      const parsed = parseAdoContextPayload(payload);
      if (!parsed) {
        writeJson(res, 400, {
          code: "INVALID_INPUT",
          message: "Provide { organization, project } as non-empty strings."
        });
        return true;
      }
      try {
        const saved = await adoContext.setContext(parsed);
        writeJson(res, 200, { context: saved });
      } catch (error) {
        writeJson(res, 500, errorPayload(error, "ADO_CONTEXT_WRITE_FAILED"));
      }
      return true;
    }

    writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." });
    return true;
  };
}

function parseAdoContextPayload(payload: unknown): { organization: string; project: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as { organization?: unknown; project?: unknown };
  const organization = typeof candidate.organization === "string" ? candidate.organization.trim() : "";
  const project = typeof candidate.project === "string" ? candidate.project.trim() : "";
  if (organization.length === 0 || project.length === 0) {
    return null;
  }
  return { organization, project };
}
