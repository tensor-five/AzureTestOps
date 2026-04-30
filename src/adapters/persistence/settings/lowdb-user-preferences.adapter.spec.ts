import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LowdbUserPreferencesAdapter } from "./lowdb-user-preferences.adapter.js";

describe("LowdbUserPreferencesAdapter", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-prefs-"));
    filePath = path.join(tempDir, "user-preferences.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns an empty object when no preferences are persisted yet", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");
    await expect(adapter.getPreferences()).resolves.toEqual({});
  });

  it("merges patches and stamps updatedAt", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    const initial = await adapter.mergePreferences({ themeMode: "dark" });
    expect(initial.themeMode).toBe("dark");
    expect(initial.updatedAt).toBeDefined();

    const updated = await adapter.mergePreferences({ activeSetId: "set-1" });
    expect(updated.themeMode).toBe("dark");
    expect(updated.activeSetId).toBe("set-1");
  });

  it("isolates preferences by user id", async () => {
    const alice = new LowdbUserPreferencesAdapter(filePath, "alice");
    const bob = new LowdbUserPreferencesAdapter(filePath, "bob");

    await alice.mergePreferences({ themeMode: "dark" });
    await bob.mergePreferences({ themeMode: "light" });

    expect((await alice.getPreferences()).themeMode).toBe("dark");
    expect((await bob.getPreferences()).themeMode).toBe("light");
  });

  it("replaces array fields wholesale and merges other top-level fields", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      sets: [
        { id: "s1", name: "Alpha", planId: "p", rootSuiteId: "su", queryId: "q" },
        { id: "s2", name: "Beta", planId: "p", rootSuiteId: "su", queryId: "q" }
      ]
    });

    const replaced = await adapter.mergePreferences({
      sets: [{ id: "s3", name: "Gamma", planId: "p", rootSuiteId: "su", queryId: "q" }]
    });

    expect(replaced.sets?.map((set) => set.id)).toEqual(["s3"]);
  });

  it("clears persisted setFilters when the patch carries an explicitly empty map", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setFilters: { "set-1": { testCases: { lastOutcomes: ["Failed"] } } }
    });

    const cleared = await adapter.mergePreferences({ setFilters: {} });
    expect(cleared.setFilters).toEqual({});

    const reloaded = await adapter.getPreferences();
    expect(reloaded.setFilters).toEqual({});
  });
});
