import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LowdbUserPreferencesAdapter } from "./lowdb-user-preferences.adapter.js";
import { LowdbSetRepository } from "./set-repository.adapter.js";

describe("LowdbSetRepository", () => {
  let tempDir: string;
  let filePath: string;
  let preferences: LowdbUserPreferencesAdapter;
  let repo: LowdbSetRepository;
  let nextId: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-sets-"));
    filePath = path.join(tempDir, "user-preferences.json");
    preferences = new LowdbUserPreferencesAdapter(filePath, "alice");
    nextId = 1;
    repo = new LowdbSetRepository({
      preferences,
      generateId: () => `set-${nextId++}`
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("create / list / getById", () => {
    it("persists a new set and assigns a generated id", async () => {
      const created = await repo.create({
        name: "Sprint 24",
        planId: "100",
        planName: "Release 1.2",
        rootSuiteId: "200",
        rootSuiteName: "Root",
        queryId: "Q-A",
        queryName: "Open Bugs"
      });

      expect(created.id).toBe("set-1");
      expect(created.name).toBe("Sprint 24");
      expect(created.planName).toBe("Release 1.2");

      expect(await repo.listSets()).toHaveLength(1);
      expect((await repo.getById("set-1"))?.name).toBe("Sprint 24");
    });

    it("respects an explicit id when supplied", async () => {
      await repo.create(baseDraft(), { id: "fixed-id" });
      expect((await repo.listSets()).map((s) => s.id)).toEqual(["fixed-id"]);
    });

    it("rejects duplicate ids", async () => {
      await repo.create(baseDraft(), { id: "dupe" });
      await expect(repo.create(baseDraft(), { id: "dupe" })).rejects.toThrow(
        /already exists/i
      );
    });

    it("returns null when getById misses", async () => {
      expect(await repo.getById("missing")).toBeNull();
    });
  });

  describe("update", () => {
    it("merges only the supplied fields", async () => {
      await repo.create(baseDraft(), { id: "s1" });
      const updated = await repo.update("s1", { name: "Renamed" });

      expect(updated.name).toBe("Renamed");
      expect(updated.planId).toBe("100");
      expect(updated.queryId).toBe("Q-A");
    });

    it("throws for unknown set ids", async () => {
      await expect(repo.update("nope", { name: "x" })).rejects.toThrow(/not found/i);
    });
  });

  describe("delete", () => {
    it("removes the set, clears activeSetId, layouts and filters for that set", async () => {
      await repo.create(baseDraft(), { id: "s1" });
      await repo.create(baseDraft(), { id: "s2" });
      await repo.setActiveId("s1");

      // Pre-seed layouts/filters via the user-preferences adapter so we can
      // assert the cascade actually wipes them.
      await preferences.mergePreferences({
        setLayouts: {
          s1: { positions: { "10": { x: 20, y: 40 } } },
          s2: { collapsedSuites: ["sa"] }
        },
        setFilters: {
          s1: { testCases: { lastOutcomes: ["Failed"] } },
          s2: { testCases: { titleQuery: "auth" } }
        }
      });

      await repo.delete("s1");

      const remaining = await repo.listSets();
      expect(remaining.map((s) => s.id)).toEqual(["s2"]);

      const prefs = await preferences.getPreferences();
      expect(prefs.activeSetId).toBeUndefined();
      expect(prefs.setLayouts).toEqual({ s2: { collapsedSuites: ["sa"] } });
      expect(prefs.setFilters).toEqual({ s2: { testCases: { titleQuery: "auth" } } });
    });

    it("is a no-op when the id does not exist", async () => {
      await repo.create(baseDraft(), { id: "s1" });
      await expect(repo.delete("ghost")).resolves.toBeUndefined();
      expect((await repo.listSets()).map((s) => s.id)).toEqual(["s1"]);
    });
  });

  describe("active set pointer", () => {
    it("returns null when nothing is active", async () => {
      expect(await repo.getActiveId()).toBeNull();
    });

    it("rejects activating an unknown set", async () => {
      await expect(repo.setActiveId("missing")).rejects.toThrow(/not found/i);
    });

    it("auto-heals a stale active pointer", async () => {
      await repo.create(baseDraft(), { id: "s1" });
      await repo.setActiveId("s1");
      expect(await repo.getActiveId()).toBe("s1");

      // Force-corrupt: write a bogus activeSetId via raw merge
      await preferences.mergePreferences({ activeSetId: "deleted-set" });
      expect(await repo.getActiveId()).toBeNull();
    });

    it("clears the active id when passed null", async () => {
      await repo.create(baseDraft(), { id: "s1" });
      await repo.setActiveId("s1");
      await repo.setActiveId(null);
      expect(await repo.getActiveId()).toBeNull();
    });
  });
});

function baseDraft() {
  return {
    name: "Set",
    planId: "100",
    rootSuiteId: "200",
    queryId: "Q-A"
  };
}
