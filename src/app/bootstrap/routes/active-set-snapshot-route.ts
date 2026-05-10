import type { IncomingMessage, ServerResponse } from "node:http";

import {
  loadActiveSetSnapshot,
  type SnapshotProgressEvent
} from "../../../application/use-cases/load-active-set-snapshot.use-case.js";
import type { AdoContextPort } from "../../../application/ports/ado-context.port.js";
import type { SetRepositoryPort } from "../../../application/ports/set-repository.port.js";
import type { AdoRuntime } from "../../composition/runtime.js";

import { applySecurityHeaders, writeJson } from "./route-helpers.js";

export type SnapshotStreamRouter = (
  method: string,
  pathname: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

const STREAM_PATH = "/phase2/active-set/snapshot/stream";

export type ActiveSetSnapshotRouteDeps = {
  ado: AdoRuntime;
  setRepository: SetRepositoryPort;
  adoContext: AdoContextPort;
};

/**
 * Server-Sent Events stream that forwards loadActiveSetSnapshot progress
 * events live and emits the resolved snapshot at the end.
 *
 * Why SSE rather than a single JSON response: the snapshot load can take
 * tens of seconds for large plans, and the Refresh button needs visible
 * progress per stage to stay friendly. SSE is one-way (server → client),
 * needs no upgrade dance, and integrates with the browser's `EventSource`.
 */
export function registerActiveSetSnapshotStreamRoute(
  deps: ActiveSetSnapshotRouteDeps
): SnapshotStreamRouter {
  return async (method, pathname, url, _req, res) => {
    if (pathname !== STREAM_PATH) {
      return false;
    }
    if (method !== "GET") {
      writeJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Use GET." });
      return true;
    }

    const setId = url.searchParams.get("setId");

    res.statusCode = 200;
    applySecurityHeaders(res);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const snapshot = await loadActiveSetSnapshot(
        setId ? { setId } : {},
        {
          setRepository: deps.setRepository,
          adoContext: deps.adoContext,
          testManagement: await deps.ado.testManagement(),
          testCaseHydration: await deps.ado.testCaseHydration(),
          workItemHydration: await deps.ado.workItemHydration(),
          savedQuery: await deps.ado.savedQuery(),
          onProgress: (event: SnapshotProgressEvent) => send("progress", event)
        }
      );

      send("result", { snapshot });
    } catch (error) {
      send("error", {
        code: extractErrorCode(error),
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      res.end();
    }

    return true;
  };
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "SNAPSHOT_FAILED";
}
