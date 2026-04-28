import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  AzureCliPreflightAdapter,
  type PreflightContext,
  type PreflightResult
} from "../../adapters/azure-devops/auth/azure-cli-preflight.adapter.js";
import {
  LowdbUserPreferencesAdapter
} from "../../adapters/persistence/settings/lowdb-user-preferences.adapter.js";
import {
  sanitizeUserPreferences,
  type UserPreferences
} from "../../shared/user-preferences/user-preferences.schema.js";
import { resolveAzCliExecutablePath } from "../../shared/utils/azure-cli-path.js";

const execFileAsync = promisify(execFile);

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const ADO_CSRF_META_PLACEHOLDER = "__ADO_CSRF_TOKEN__";
const ADO_CSRF_HEADER = "x-ado-csrf-token";

const FAVICON_SVG = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="12" fill="#842CC3"/>',
  '<path d="M16 22 L32 22 L32 46 L28 46 L28 26 L16 26 Z" fill="#ffffff"/>',
  '<path d="M36 22 L48 22 L48 26 L42 26 L42 46 L38 46 L38 26 L36 26 Z" fill="#87F3A4"/>',
  "</svg>"
].join("");
const FAVICON_SVG_BUFFER = Buffer.from(FAVICON_SVG, "utf8");

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; " +
  "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://api.fontshare.com; " +
  "img-src 'self' data:; font-src 'self' data: https://cdn.fontshare.com; connect-src 'self'";

const ROOT_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="ado-csrf-token" content="${ADO_CSRF_META_PLACEHOLDER}" />
    <title>Azure TestOps</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script>
      (() => {
        const key = "${THEME_MODE_STORAGE_KEY}";
        let mode = "system";
        try {
          const persisted = window.localStorage.getItem(key);
          if (persisted === "light" || persisted === "dark" || persisted === "system") {
            mode = persisted;
          }
        } catch {}

        const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        const effectiveTheme = mode === "dark" ? "dark" : mode === "light" ? "light" : (prefersDark ? "dark" : "light");
        const root = document.documentElement;
        root.dataset.themeMode = mode;
        root.dataset.theme = effectiveTheme;
      })();
    </script>
  </head>
  <body>
    <div id="app"></div>
    <link rel="stylesheet" href="/dist/src/app/bootstrap/local-ui-entry.browser.css" />
    <script type="module" src="/dist/src/app/bootstrap/local-ui-entry.browser.js"></script>
  </body>
</html>
`;

export type HttpServer = {
  close: () => Promise<void>;
};

export type AzLoginRunner = () => Promise<{ message: string }>;

export type HttpServerOptions = {
  port: number;
  preflightAdapter?: AzureCliPreflightAdapter;
  userPreferences?: LowdbUserPreferencesAdapter;
  azLoginRunner?: AzLoginRunner;
  preflightContext?: PreflightContext;
  distRootPath?: string;
  userPreferencesFilePath?: string;
};

const compiledFileDir = path.dirname(fileURLToPath(import.meta.url));
const fallbackProjectRoot = path.resolve(compiledFileDir, "..", "..", "..", "..");

export function createHttpServer(options: HttpServerOptions): HttpServer {
  const csrfToken = randomBytes(32).toString("hex");
  const distRootPath = path.resolve(options.distRootPath ?? path.join(fallbackProjectRoot, "dist"));
  const userPreferencesFilePath =
    options.userPreferencesFilePath ?? path.join(os.homedir(), ".azure-testops", "user-preferences.json");
  const userId = resolveLocalUserId();

  const preflightAdapter = options.preflightAdapter ?? new AzureCliPreflightAdapter();
  const userPreferences =
    options.userPreferences ?? new LowdbUserPreferencesAdapter(userPreferencesFilePath, userId);
  const azLoginRunner = options.azLoginRunner ?? defaultAzLoginRunner;

  const server = createServer((req, res) => {
    void route(req, res, {
      csrfToken,
      distRootPath,
      preflightAdapter,
      preflightContext: options.preflightContext,
      userPreferences,
      azLoginRunner
    }).catch((error) => {
      console.error("[http-server] unhandled error", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        applySecurityHeaders(res);
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify({ code: "INTERNAL_ERROR", message: "Unexpected server error." }));
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

type RouteDeps = {
  csrfToken: string;
  distRootPath: string;
  preflightAdapter: AzureCliPreflightAdapter;
  preflightContext?: PreflightContext;
  userPreferences: LowdbUserPreferencesAdapter;
  azLoginRunner: AzLoginRunner;
};

async function route(req: IncomingMessage, res: ServerResponse, deps: RouteDeps): Promise<void> {
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

  if (method === "GET" && pathname === "/favicon.svg") {
    writeFaviconSvg(res);
    return;
  }

  if (method === "GET" && pathname === "/favicon.ico") {
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
    await handleGetUserPreferences(res, deps);
    return;
  }

  if (method === "POST" && pathname === "/phase2/user-preferences") {
    await handlePostUserPreferences(req, res, deps);
    return;
  }

  if (method === "POST" && pathname === "/phase2/az-login") {
    await handleAzLogin(res, deps);
    return;
  }

  if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    writeHtml(res, 200, renderRootHtml(deps.csrfToken));
    return;
  }

  writeJson(res, 404, { code: "NOT_FOUND", message: "Route not found." });
}

function isCsrfProtected(method: string, pathname: string): boolean {
  if (method !== "POST") {
    return false;
  }
  return pathname === "/phase2/user-preferences" || pathname === "/phase2/az-login";
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

async function handleAuthPreflight(res: ServerResponse, deps: RouteDeps): Promise<void> {
  const context: PreflightContext = deps.preflightContext ?? readPreflightContextFromEnv();
  try {
    const result: PreflightResult = await deps.preflightAdapter.check(context);
    writeJson(res, 200, { result });
  } catch (error) {
    writeJson(res, 500, {
      code: "PREFLIGHT_FAILED",
      message: error instanceof Error ? error.message : "Auth preflight failed."
    });
  }
}

async function handleGetUserPreferences(res: ServerResponse, deps: RouteDeps): Promise<void> {
  try {
    const preferences = await deps.userPreferences.getPreferences();
    writeJson(res, 200, { preferences });
  } catch (error) {
    writeJson(res, 500, {
      code: "PREFERENCES_READ_FAILED",
      message: error instanceof Error ? error.message : "Unable to read user preferences."
    });
  }
}

async function handlePostUserPreferences(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDeps
): Promise<void> {
  const body = await readBody(req);
  const payload = parseJsonBody(body);
  const patch = parseUserPreferencesPatch(payload);

  if (!patch) {
    writeJson(res, 400, { code: "INVALID_INPUT", message: "Provide preferences as an object." });
    return;
  }

  try {
    const preferences = await deps.userPreferences.mergePreferences(patch);
    writeJson(res, 200, { status: "OK", preferences });
  } catch (error) {
    writeJson(res, 500, {
      code: "PREFERENCES_WRITE_FAILED",
      message: error instanceof Error ? error.message : "Unable to persist user preferences."
    });
  }
}

async function handleAzLogin(res: ServerResponse, deps: RouteDeps): Promise<void> {
  try {
    const result = await deps.azLoginRunner();
    writeJson(res, 200, { status: "OK", message: result.message });
  } catch (error) {
    writeJson(res, 500, {
      code: "AZ_LOGIN_FAILED",
      message: error instanceof Error ? error.message : "Azure CLI login failed."
    });
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

  return sanitizeUserPreferences(candidate.preferences);
}

function readPreflightContextFromEnv(): PreflightContext {
  return {
    organization: process.env.ADO_ORGANIZATION?.trim() ?? "",
    project: process.env.ADO_PROJECT?.trim() ?? ""
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const limit = 1024 * 1024; // 1 MiB

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > limit) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJsonBody(body: string): unknown {
  if (body.length === 0) {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
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
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml; charset=utf-8";
  }
  return "application/octet-stream";
}

function renderRootHtml(csrfToken: string): string {
  return ROOT_HTML.replace(ADO_CSRF_META_PLACEHOLDER, csrfToken);
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  applySecurityHeaders(res);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function writeHtml(res: ServerResponse, statusCode: number, payload: string): void {
  res.statusCode = statusCode;
  applySecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(payload);
}

function writeFaviconSvg(res: ServerResponse): void {
  res.statusCode = 200;
  applySecurityHeaders(res);
  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.end(FAVICON_SVG_BUFFER);
}

function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
}

function readHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    const first = header[0];
    return typeof first === "string" && first.length > 0 ? first : null;
  }
  return typeof header === "string" && header.length > 0 ? header : null;
}

function resolveLocalUserId(): string {
  const fromEnv = process.env.USER ?? process.env.USERNAME;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  try {
    return os.userInfo().username;
  } catch {
    return "local-user";
  }
}

async function defaultAzLoginRunner(): Promise<{ message: string }> {
  const azExecutable = await resolveAzCliExecutablePath();
  await execFileAsync(azExecutable, ["login", "--use-device-code", "--output", "none"], {
    timeout: 5 * 60_000,
    windowsHide: true
  });
  return { message: "Azure CLI login completed." };
}
