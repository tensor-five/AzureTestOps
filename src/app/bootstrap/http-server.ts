import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";

const FAVICON_SVG = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="12" fill="#842CC3"/>',
  '<path d="M16 22 L32 22 L32 46 L28 46 L28 26 L16 26 Z" fill="#ffffff"/>',
  '<path d="M36 22 L48 22 L48 26 L42 26 L42 46 L38 46 L38 26 L36 26 Z" fill="#87F3A4"/>',
  "</svg>"
].join("");
const FAVICON_SVG_BUFFER = Buffer.from(FAVICON_SVG, "utf8");

const ROOT_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

export type HttpServerOptions = {
  port: number;
};

export type HttpServer = {
  close: () => Promise<void>;
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export function createHttpServer(options: HttpServerOptions): HttpServer {
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      console.error("[http-server] unhandled error", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
      }
      res.end("Internal Server Error");
    });
  });

  server.listen(options.port);

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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "OK" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/favicon.svg") {
    res.statusCode = 200;
    res.setHeader("content-type", "image/svg+xml; charset=utf-8");
    res.end(FAVICON_SVG_BUFFER);
    return;
  }

  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.statusCode = 200;
    res.setHeader("content-type", "image/svg+xml; charset=utf-8");
    res.end(FAVICON_SVG_BUFFER);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/dist/")) {
    await serveStaticFile(url.pathname, res);
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(ROOT_HTML);
    return;
  }

  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Not Found");
}

async function serveStaticFile(urlPath: string, res: ServerResponse): Promise<void> {
  const safePath = urlPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(projectRoot, safePath);

  if (!absolutePath.startsWith(projectRoot)) {
    res.statusCode = 403;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(absolutePath);
    res.statusCode = 200;
    res.setHeader("content-type", contentTypeFor(absolutePath));
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not Found");
  }
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
  return "application/octet-stream";
}
