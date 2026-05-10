import { describe, expect, it } from "vitest";

import { renderRootHtml } from "./bootstrap-html.js";

describe("renderRootHtml", () => {
  it("inlines the supplied CSRF token into the meta tag", () => {
    const html = renderRootHtml("token-abc-123");
    expect(html).toContain('<meta name="ado-csrf-token" content="token-abc-123" />');
    expect(html).not.toContain("__ADO_CSRF_TOKEN__");
  });

  it("references the favicon and the bundled UI assets so the browser links them on load", () => {
    const html = renderRootHtml("t");
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/dist/src/app/bootstrap/local-ui-entry.browser.css"');
    expect(html).toContain('src="/dist/src/app/bootstrap/local-ui-entry.browser.js"');
  });

  it("inlines the pre-paint theme script so the first paint avoids a FOUC", () => {
    const html = renderRootHtml("t");
    expect(html).toContain("azure-testops.theme-mode.v1");
    expect(html).toContain("dataset.theme");
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("renders an #app mount point matching the local-ui-entry expectation", () => {
    expect(renderRootHtml("t")).toContain('<div id="app"></div>');
  });

  it("escapes nothing about the token (delegates to caller) but the placeholder is gone", () => {
    // The caller produces the token via `randomBytes(32).toString('hex')`, so
    // the rendered page will never contain the placeholder. Sanity check.
    expect(renderRootHtml("abc")).not.toContain("__ADO_CSRF_TOKEN__");
  });
});
