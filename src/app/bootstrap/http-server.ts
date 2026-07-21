import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAzCliExecutablePath } from "../../shared/utils/azure-cli-path.js";
import { runAzCli } from "../../shared/utils/azure-cli-runner.js";
import { parseAdoCliDefaults, type AdoCliDefaults } from "../../shared/azure-devops/parse-ado-defaults.js";
import {
  sanitizeUserPreferences,
  type UserPreferences
} from "../../shared/user-preferences/user-preferences.schema.js";
import { sanitizeKeyedPreferencePatch } from "../../shared/user-preferences/keyed-preference-patch.js";
import type { AdoContextPort, AdoContext } from "../../application/ports/ado-context.port.js";
import type {
  AuthPreflightPort,
  AuthPreflightResult,
  PreflightContext
} from "../../application/ports/auth-preflight.port.js";
import type { SetRepositoryPort } from "../../application/ports/set-repository.port.js";
import type { UserPreferencesPort } from "../../application/ports/user-preferences.port.js";

import {
  applySecurityHeaders,
  errorPayload,
  parseJsonBody,
  readBody,
  writeJson
} from "./routes/route-helpers.js";
import { registerAdoContextRoutes } from "./routes/ado-context-routes.js";
import { registerSetRoutes } from "./routes/sets-routes.js";
import { registerCatalogRoutes } from "./routes/catalog-routes.js";
import { registerActiveSetSnapshotStreamRoute } from "./routes/active-set-snapshot-route.js";
import { registerActiveSetSnapshotDebugRoute } from "./routes/active-set-snapshot-debug-route.js";
import { registerRelationsRoutes } from "./routes/relations-routes.js";
import { renderRootHtml } from "./bootstrap-html.js";
import { writeFaviconSvg } from "./favicon-svg.js";
import type { AdoRuntime } from "../composition/runtime.js";

const ADO_CSRF_HEADER = "x-ado-csrf-token";

export type HttpServer = {
  close: () => Promise<void>;
};

export type AzLoginRunner = () => Promise<{ message: string }>;

export type HttpServerDependencies = {
  preflight: AuthPreflightPort;
  userPreferences: UserPreferencesPort;
  setRepository: SetRepositoryPort;
  adoContext: AdoContextPort;
  /** Required only for the SSE snapshot stream and ADO catalog endpoints. */
  ado?: AdoRuntime;
};

export type HttpServerOptions = {
  port: number;
  deps: HttpServerDependencies;
  azLoginRunner?: AzLoginRunner;
  preflightContext?: PreflightContext;
  distRootPath?: string;
};

const compiledFileDir = path.dirname(fileURLToPath(import.meta.url));
const fallbackProjectRoot = path.resolve(compiledFileDir, "..", "..", "..", "..");

export function createHttpServer(options: HttpServerOptions): HttpServer {
  const csrfToken = randomBytes(32).toString("hex");
  const distRootPath = path.resolve(options.distRootPath ?? path.join(fallbackProjectRoot, "dist"));
  const azLoginRunner = options.azLoginRunner ?? defaultAzLoginRunner;

  const router = buildRouter({
    deps: options.deps,
    azLoginRunner,
    preflightContext: options.preflightContext,
    csrfToken,
    distRootPath
  });

  const server = createServer((req, res) => {
    void router(req, res).catch((error) => {
      console.error("[http-server] unhandled error", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        applySecurityHeaders(res);
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(errorPayload(error, "INTERNAL_ERROR")));
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[http-server] Port ${options.port} is already in use. Stop the other process or set a different PORT.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(options.port, "127.0.0.1");

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

type RouterDeps = {
  deps: HttpServerDependencies;
  azLoginRunner: AzLoginRunner;
  preflightContext?: PreflightContext;
  csrfToken: string;
  distRootPath: string;
};

type Router = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function buildRouter(deps: RouterDeps): Router {
  const adoContextRoutes = registerAdoContextRoutes(deps.deps.adoContext);
  const setRoutes = registerSetRoutes(deps.deps.setRepository);
  const catalogRoutes = deps.deps.ado ? registerCatalogRoutes(deps.deps.ado) : null;
  const snapshotRoute = deps.deps.ado
    ? registerActiveSetSnapshotStreamRoute({
        ado: deps.deps.ado,
        setRepository: deps.deps.setRepository,
        adoContext: deps.deps.adoContext
      })
    : null;
  const snapshotDebugRoute = deps.deps.ado
    ? registerActiveSetSnapshotDebugRoute({
        ado: deps.deps.ado,
        setRepository: deps.deps.setRepository,
        adoContext: deps.deps.adoContext
      })
    : null;
  const relationsRoutes = deps.deps.ado ? registerRelationsRoutes(deps.deps.ado) : null;

  return async function route(req, res) {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (isCsrfProtected(method, pathname) && !isValidCsrfRequest(req, deps.csrfToken)) {
      writeJson(res, 403, { code: "CSRF_INVALID", message: "Missing or invalid CSRF protection." });
      return;
    }

    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, { status: "OK" });
      return;
    }
    if (method === "GET" && (pathname === "/favicon.svg" || pathname === "/favicon.ico")) {
      writeFaviconSvg(res);
      return;
    }
    if (method === "GET" && pathname.startsWith("/dist/")) {
      await serveDistAsset(pathname, deps.distRootPath, res);
      return;
    }
    if (method === "GET" && pathname === "/phase2/auth-preflight") {
      await handleAuthPreflight(res, deps);
      return;
    }
    if (method === "GET" && pathname === "/phase2/user-preferences") {
      await handleGetUserPreferences(res, deps.deps.userPreferences);
      return;
    }
    if (method === "POST" && pathname === "/phase2/user-preferences") {
      await handlePostUserPreferences(req, res, deps.deps.userPreferences);
      return;
    }
    if (method === "POST" && pathname === "/phase2/az-login") {
      await handleAzLogin(res, deps.azLoginRunner);
      return;
    }
    if (method === "GET" && pathname === "/phase2/az-cli-defaults") {
      await handleGetAzCliDefaults(res);
      return;
    }
    if (await adoContextRoutes(method, pathname, req, res)) return;
    if (await setRoutes(method, pathname, req, res)) return;
    if (catalogRoutes && (await catalogRoutes(method, pathname, url, req, res))) return;
    if (snapshotRoute && (await snapshotRoute(method, pathname, url, req, res))) return;
    if (snapshotDebugRoute && (await snapshotDebugRoute(method, pathname, url, req, res))) return;
    if (relationsRoutes && (await relationsRoutes(method, pathname, req, res))) return;

    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      writeHtml(res, 200, renderRootHtml(deps.csrfToken));
      return;
    }

    writeJson(res, 404, { code: "NOT_FOUND", message: "Route not found." });
  };
}

function isCsrfProtected(method: string, pathname: string): boolean {
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
    return false;
  }
  if (pathname === "/phase2/user-preferences" && method === "POST") return true;
  if (pathname === "/phase2/az-login" && method === "POST") return true;
  if (pathname === "/phase2/ado-context" && method === "POST") return true;
  if (pathname === "/phase2/sets" && method === "POST") return true;
  if (pathname === "/phase2/active-set" && method === "POST") return true;
  if (
    pathname.startsWith("/phase2/sets/") &&
    (method === "PATCH" || method === "DELETE" || method === "POST")
  ) {
    return true;
  }
  if (pathname === "/phase2/relations" && (method === "POST" || method === "DELETE")) {
    return true;
  }
  return false;
}

function isValidCsrfRequest(req: IncomingMessage, expectedToken: string): boolean {
  const tokenHeader = req.headers[ADO_CSRF_HEADER];
  const providedToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  if (typeof providedToken !== "string" || providedToken.length === 0 || providedToken !== expectedToken) {
    return false;
  }

  const host = readHeaderValue(req.headers.host);
  if (!host) {
    return false;
  }

  const expectedOrigin = `http://${host}`;
  const origin = readHeaderValue(req.headers.origin);
  if (origin && origin !== expectedOrigin) {
    return false;
  }

  const referer = readHeaderValue(req.headers.referer);
  if (referer && !referer.startsWith(`${expectedOrigin}/`) && referer !== expectedOrigin) {
    return false;
  }

  return true;
}

async function handleAuthPreflight(res: ServerResponse, deps: RouterDeps): Promise<void> {
  const context: PreflightContext = deps.preflightContext ?? (await readPreflightContextFromAdo(deps.deps.adoContext));
  try {
    const result: AuthPreflightResult = await deps.deps.preflight.check(context);
    writeJson(res, 200, { result });
  } catch (error) {
    writeJson(res, 500, errorPayload(error, "PREFLIGHT_FAILED"));
  }
}

async function handleGetUserPreferences(
  res: ServerResponse,
  userPreferences: UserPreferencesPort
): Promise<void> {
  try {
    const preferences = await userPreferences.getPreferences();
    writeJson(res, 200, { preferences });
  } catch (error) {
    writeJson(res, 500, errorPayload(error, "PREFERENCES_READ_FAILED"));
  }
}

async function handlePostUserPreferences(
  req: IncomingMessage,
  res: ServerResponse,
  userPreferences: UserPreferencesPort
): Promise<void> {
  const body = await readBody(req);
  const payload = parseJsonBody(body);
  const patch = parseUserPreferencesPatch(payload);

  if (!patch) {
    writeJson(res, 400, { code: "INVALID_INPUT", message: "Provide preferences as an object." });
    return;
  }

  try {
    const preferences = await userPreferences.mergePreferences(patch);
    writeJson(res, 200, { status: "OK", preferences });
  } catch (error) {
    writeJson(res, 500, errorPayload(error, "PREFERENCES_WRITE_FAILED"));
  }
}

async function handleGetAzCliDefaults(res: ServerResponse): Promise<void> {
  try {
    const azExecutable = await resolveAzCliExecutablePath();
    const result = await runAzCli(azExecutable, ["devops", "configure", "--list"], {
      timeoutMs: 10_000
    });

    if (result.exitCode !== 0) {
      // Defaults are optional — surface an empty payload so the setup form
      // simply falls back to manual entry instead of failing loudly.
      writeJson(res, 200, { defaults: emptyDefaults() });
      return;
    }

    writeJson(res, 200, { defaults: parseAdoCliDefaults(result.stdout) });
  } catch (error) {
    writeJson(res, 500, errorPayload(error, "AZ_CLI_DEFAULTS_FAILED"));
  }
}

function emptyDefaults(): AdoCliDefaults {
  return { organization: "", project: "" };
}

async function handleAzLogin(res: ServerResponse, runner: AzLoginRunner): Promise<void> {
  try {
    const result = await runner();
    writeJson(res, 200, { status: "OK", message: result.message });
  } catch (error) {
    writeJson(res, 500, errorPayload(error, "AZ_LOGIN_FAILED"));
  }
}

function parseUserPreferencesPatch(payload: unknown): UserPreferences | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as { preferences?: unknown };
  if (!candidate.preferences || typeof candidate.preferences !== "object") {
    return null;
  }
  const sanitized = sanitizeUserPreferences(candidate.preferences);
  const layoutPatch = sanitizeKeyedPreferencePatch(
    candidate.preferences,
    "setLayouts",
    sanitized.setLayouts
  );
  const filterPatch = sanitizeKeyedPreferencePatch(
    candidate.preferences,
    "setFilters",
    sanitized.setFilters
  );
  return {
    ...sanitized,
    setLayouts: layoutPatch.values,
    setFilters: filterPatch.values
  };
}

async function readPreflightContextFromAdo(adoContext: AdoContextPort): Promise<PreflightContext> {
  const context: AdoContext | null = await adoContext.getContext().catch(() => null);
  if (context) {
    return { organization: context.organization, project: context.project };
  }
  return {
    organization: process.env.ADO_ORGANIZATION?.trim() ?? "",
    project: process.env.ADO_PROJECT?.trim() ?? ""
  };
}

async function serveDistAsset(pathname: string, distRootPath: string, res: ServerResponse): Promise<void> {
  const assetPath = resolveDistAssetPath(pathname, distRootPath);

  if (!assetPath) {
    writeJson(res, 404, { code: "NOT_FOUND", message: "Route not found." });
    return;
  }

  try {
    const fileStat = await stat(assetPath);

    if (!fileStat.isFile()) {
      writeJson(res, 404, { code: "NOT_FOUND", message: "Route not found." });
      return;
    }

    const content = await readFile(assetPath);
    res.statusCode = 200;
    applySecurityHeaders(res);
    res.setHeader("content-type", contentTypeFor(assetPath));
    res.end(content);
  } catch {
    writeJson(res, 404, { code: "NOT_FOUND", message: "Route not found." });
  }
}

function resolveDistAssetPath(pathname: string, distRootPath: string): string | null {
  const encodedRelativePath = pathname.slice("/dist/".length);

  let decodedRelativePath = "";
  try {
    decodedRelativePath = decodeURIComponent(encodedRelativePath);
  } catch {
    return null;
  }

  const normalizedRelativePath = path.normalize(decodedRelativePath);
  const absolutePath = path.resolve(distRootPath, normalizedRelativePath);

  if (absolutePath === distRootPath || !absolutePath.startsWith(`${distRootPath}${path.sep}`)) {
    return null;
  }

  return absolutePath;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  return "application/octet-stream";
}

function writeHtml(res: ServerResponse, statusCode: number, payload: string): void {
  res.statusCode = statusCode;
  applySecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(payload);
}

function readHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    const first = header[0];
    return typeof first === "string" && first.length > 0 ? first : null;
  }
  return typeof header === "string" && header.length > 0 ? header : null;
}

async function defaultAzLoginRunner(): Promise<{ message: string }> {
  const azExecutable = await resolveAzCliExecutablePath();
  const result = await runAzCli(
    azExecutable,
    ["login", "--use-device-code", "--output", "none"],
    { timeoutMs: 5 * 60_000 }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Azure CLI login failed (exit ${result.exitCode}): ${result.stderr.trim() || "no stderr"}`
    );
  }
  return { message: "Azure CLI login completed." };
}
