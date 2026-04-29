import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileAdoContextAdapter } from "./file-ado-context.adapter.js";

describe("FileAdoContextAdapter", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-ado-context-"));
    filePath = path.join(tempDir, "nested", "ado-context.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when the file does not exist yet", async () => {
    const adapter = new FileAdoContextAdapter(filePath);
    expect(await adapter.getContext()).toBeNull();
  });

  it("creates parent directories and round-trips the context", async () => {
    const adapter = new FileAdoContextAdapter(filePath);
    const written = await adapter.setContext({ organization: "  contoso  ", project: " delivery " });

    expect(written).toEqual({ organization: "contoso", project: "delivery" });
    expect(await adapter.getContext()).toEqual({ organization: "contoso", project: "delivery" });
  });

  it("rejects empty organization or project", async () => {
    const adapter = new FileAdoContextAdapter(filePath);
    await expect(adapter.setContext({ organization: "", project: "p" })).rejects.toThrow(/required/i);
    await expect(adapter.setContext({ organization: "o", project: "   " })).rejects.toThrow(/required/i);
  });

  it("returns null for a malformed file", async () => {
    const adapter = new FileAdoContextAdapter(filePath);
    await adapter.setContext({ organization: "contoso", project: "delivery" });
    await writeFile(filePath, "not-json", "utf-8");
    expect(await adapter.getContext()).toBeNull();
  });

  it("returns null for an unknown version", async () => {
    const adapter = new FileAdoContextAdapter(filePath);
    await adapter.setContext({ organization: "contoso", project: "delivery" });
    await writeFile(
      filePath,
      JSON.stringify({ version: 99, organization: "contoso", project: "delivery" }),
      "utf-8"
    );
    expect(await adapter.getContext()).toBeNull();
  });
});
