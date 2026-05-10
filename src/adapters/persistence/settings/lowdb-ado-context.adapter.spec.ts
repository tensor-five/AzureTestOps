import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LowdbAdoContextAdapter } from "./lowdb-ado-context.adapter.js";
import { LowdbUserPreferencesAdapter } from "./lowdb-user-preferences.adapter.js";

describe("LowdbAdoContextAdapter", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-ado-context-"));
    filePath = path.join(tempDir, "user-preferences.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null before the context is configured", async () => {
    const preferences = new LowdbUserPreferencesAdapter(filePath, "alice");
    const adapter = new LowdbAdoContextAdapter(preferences);

    await expect(adapter.getContext()).resolves.toBeNull();
  });

  it("trims and persists the context through user preferences", async () => {
    const preferences = new LowdbUserPreferencesAdapter(filePath, "alice");
    const adapter = new LowdbAdoContextAdapter(preferences);

    const saved = await adapter.setContext({
      organization: "  contoso  ",
      project: " delivery "
    });

    expect(saved).toEqual({ organization: "contoso", project: "delivery" });
    await expect(adapter.getContext()).resolves.toEqual({
      organization: "contoso",
      project: "delivery"
    });
    await expect(preferences.getPreferences()).resolves.toMatchObject({
      adoContext: { organization: "contoso", project: "delivery" }
    });
  });

  it("rejects blank organization or project values", async () => {
    const preferences = new LowdbUserPreferencesAdapter(filePath, "alice");
    const adapter = new LowdbAdoContextAdapter(preferences);

    await expect(adapter.setContext({ organization: "", project: "delivery" })).rejects.toThrow(
      /required/i
    );
    await expect(adapter.setContext({ organization: "contoso", project: "   " })).rejects.toThrow(
      /required/i
    );
  });
});
