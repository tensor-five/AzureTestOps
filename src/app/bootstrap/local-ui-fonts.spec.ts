import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bootstrapDir = path.dirname(fileURLToPath(import.meta.url));

describe("local UI font loading", () => {
  it("does not reference Fontshare or Satoshi in product CSS", async () => {
    const css = await readBootstrapCss();

    expect(css).not.toMatch(/fontshare/i);
    expect(css).not.toMatch(/Satoshi/i);
  });

  it("does not define font faces or import external CSS in bootstrap CSS", async () => {
    const css = await readBootstrapCss();
    const imports = [...css.matchAll(/@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?/gi)].map(
      (match) => match[1]
    );

    expect(css).not.toMatch(/@font-face/i);
    expect(imports.filter(isExternalHttpUrl)).toEqual([]);
  });
});

async function readBootstrapCss(): Promise<string> {
  const fileNames = (await readdir(bootstrapDir)).filter((fileName) => fileName.endsWith(".css"));
  const contents = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(bootstrapDir, fileName);
      return `${fileName}\n${await readFile(filePath, "utf8")}`;
    })
  );
  return contents.join("\n");
}

function isExternalHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
