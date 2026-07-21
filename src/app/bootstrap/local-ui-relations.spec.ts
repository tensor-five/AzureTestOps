import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "local-ui-relations.css");

describe("local relations UI", () => {
  it("keeps the relation corridor free of decorative labels and gradients", async () => {
    const css = await readFile(cssPath, "utf8");

    expect(css).not.toContain(".relations-view::before");
    expect(css).not.toMatch(/content:\s*["']Relations["']/);
  });
});
