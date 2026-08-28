import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = await readFile(path.resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");

describe("Compact Bug stack gap contract v1", () => {
  it("CBG-01 and CBG-02 use the compact gap without changing the shared slot height", () => {
    expect(css).toMatch(/\.relations-view-work-item-list\s*\{[^}]*gap:\s*var\(--space-0-5\)/su);
    expect(css).toMatch(/--relations-view-work-item-slot-height:\s*calc\(var\(--space-8\) \+ var\(--space-1\)\)/u);
  });
});
