const ADO_CSRF_META_SELECTOR = 'meta[name="ado-csrf-token"]';

/**
 * Reads the CSRF token the local server inlines into the bootstrap HTML.
 *
 * The browser cannot read the token from a cookie (the local server does
 * not issue one); instead, the server embeds it in a `<meta>` tag so that a
 * tab refresh after a server restart picks the new token up automatically.
 *
 * Returns `null` when running outside the browser (no `document`) or when
 * the meta tag is missing — callers decide whether that is a hard error.
 */
export function readCsrfTokenFromMeta(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const meta = document.querySelector(ADO_CSRF_META_SELECTOR);
  if (!(meta instanceof HTMLMetaElement)) {
    return null;
  }
  const token = meta.content.trim();
  return token.length > 0 ? token : null;
}
