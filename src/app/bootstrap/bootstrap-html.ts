/**
 * Owns the root HTML document served at `/` plus the pre-paint inline script
 * that hydrates the theme before React mounts. Kept separate from
 * `http-server.ts` so the routing layer doesn't accumulate UI string
 * literals (one-file-one-responsibility per AGENTS.md §Clean-Code).
 */

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const ADO_CSRF_META_PLACEHOLDER = "__ADO_CSRF_TOKEN__";

/**
 * Pre-paint inline script.
 *
 * Reads `themeMode` from localStorage *only* to avoid a flash of unthemed
 * content (FOUC) before the React tree mounts and reads the lowdb-backed
 * preferences. lowdb remains the leading source of truth (per AGENTS.md
 * §Verbindliche Persistenz-Referenz) — this script's value is always
 * overwritten once `hydrateUserPreferences()` resolves and the React
 * `applyThemeMode` effect runs in `ui-client.tsx`.
 *
 * If localStorage is unavailable or empty, we fall back to the OS
 * `prefers-color-scheme` media query so dark-mode users still see a dark
 * paint on first frame.
 */
const PRE_PAINT_THEME_SCRIPT = `(() => {
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
})();`;

const ROOT_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="ado-csrf-token" content="${ADO_CSRF_META_PLACEHOLDER}" />
    <title>AzureTestOps</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script>
      ${PRE_PAINT_THEME_SCRIPT}
    </script>
  </head>
  <body>
    <div id="app"></div>
    <link rel="stylesheet" href="/dist/src/app/bootstrap/local-ui-entry.browser.css" />
    <script type="module" src="/dist/src/app/bootstrap/local-ui-entry.browser.js"></script>
  </body>
</html>
`;

export function renderRootHtml(csrfToken: string): string {
  return ROOT_HTML.replace(ADO_CSRF_META_PLACEHOLDER, csrfToken);
}
