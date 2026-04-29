import type { ServerResponse } from "node:http";

import { applySecurityHeaders } from "./routes/route-helpers.js";

/**
 * Inline favicon asset. The SVG is served standalone (`/favicon.svg`) so it
 * cannot reference CSS custom properties — the brand hex values are duplicated
 * here intentionally and must stay in sync with `local-ui-tokens.css`:
 *
 *   #842CC3 → --color-primary
 *   #87F3A4 → --color-secondary
 *   #ffffff → --color-on-primary
 */
export const FAVICON_SVG = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="12" fill="#842CC3"/>',
  '<path d="M16 22 L32 22 L32 46 L28 46 L28 26 L16 26 Z" fill="#ffffff"/>',
  '<path d="M36 22 L48 22 L48 26 L42 26 L42 46 L38 46 L38 26 L36 26 Z" fill="#87F3A4"/>',
  "</svg>"
].join("");

const FAVICON_SVG_BUFFER = Buffer.from(FAVICON_SVG, "utf8");

export function writeFaviconSvg(res: ServerResponse): void {
  res.statusCode = 200;
  applySecurityHeaders(res);
  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.end(FAVICON_SVG_BUFFER);
}
