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

  it("merges setFilters per setId without clobbering other entries", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setFilters: {
        "set-1": { testCases: { lastOutcomes: ["Failed"] } },
        "set-2": { workItems: { states: ["Active"] } }
      }
    });

    const merged = await adapter.mergePreferences({
      setFilters: { "set-1": { testCases: { lastOutcomes: ["Passed"] } } }
    });

    expect(merged.setFilters).toEqual({
      "set-1": { testCases: { lastOutcomes: ["Passed"] } },
      "set-2": { workItems: { states: ["Active"] } }
    });
  });

  it("deletes a single setFilters entry when the patch carries an empty value for that setId", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setFilters: {
        "set-1": { testCases: { lastOutcomes: ["Failed"] } },
        "set-2": { workItems: { states: ["Active"] } }
      }
    });

    const cleared = await adapter.mergePreferences({
      setFilters: { "set-1": {} }
    });

    expect(cleared.setFilters).toEqual({
      "set-2": { workItems: { states: ["Active"] } }
    });
  });

  it("merges setLayouts per setId without clobbering other entries", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    const merged = await adapter.mergePreferences({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } }
    });

    expect(merged.setLayouts).toEqual({
      "set-1": { workItemOrder: [1, 2] },
      "set-2": { workItemOrder: [10, 20] }
    });
  });

  it("deletes a single setLayouts entry when the patch carries an empty value for that setId", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setLayouts: {
        "set-1": { collapsedSuites: ["100"] },
        "set-2": { workItemOrder: [10, 20] }
      }
    });

    const cleared = await adapter.mergePreferences({
      setLayouts: { "set-1": {} }
    });

    expect(cleared.setLayouts).toEqual({
      "set-2": { workItemOrder: [10, 20] }
    });
  });

  it("does not delete keyed preferences for invalid or unknown non-empty values", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");
    await adapter.mergePreferences({
      setLayouts: { "set-1": { workItemOrder: [1, 2] } },
      setFilters: { "set-1": { workItems: { states: ["Active"] } } }
    });

    await adapter.mergePreferences({
      setLayouts: { "set-1": { version: 2 } as never },
      setFilters: { "set-1": { workItems: { states: "future" } } as never }
    });

    const current = await adapter.getPreferences();
    expect(current.setLayouts).toEqual({ "set-1": { workItemOrder: [1, 2] } });
    expect(current.setFilters).toEqual({
      "set-1": { workItems: { states: ["Active"] } }
    });
  });

  it("treats a patch without setLayouts/setFilters as no-op for those scopes", async () => {
    const adapter = new LowdbUserPreferencesAdapter(filePath, "alice");

    await adapter.mergePreferences({
      setLayouts: { "set-1": { collapsedSuites: ["100"] } },
      setFilters: { "set-1": { testCases: { lastOutcomes: ["Failed"] } } }
    });

    const after = await adapter.mergePreferences({ themeMode: "dark" });

    expect(after.themeMode).toBe("dark");
    expect(after.setLayouts).toEqual({ "set-1": { collapsedSuites: ["100"] } });
    expect(after.setFilters).toEqual({
      "set-1": { testCases: { lastOutcomes: ["Failed"] } }
    });
  });
});
