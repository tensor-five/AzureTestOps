import { describe, expect, it } from "vitest";

import { listSets } from "./list-sets.use-case.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";
import type { Set } from "../../domain/sets/set.js";

describe("listSets", () => {
  it("returns sets and active id from the repository", async () => {
    const items: Set[] = [
      { id: "s1", name: "Alpha", planId: "1", rootSuiteId: "10", queryId: "q-1" }
    ];
    const repo: SetRepositoryPort = {
      listSets: async () => items,
      getById: async () => null,
      create: async () => items[0],
      update: async () => items[0],
      delete: async () => undefined,
      getActiveId: async () => "s1",
      setActiveId: async () => undefined
    };

    expect(await listSets({ setRepository: repo })).toEqual({
      sets: items,
      activeSetId: "s1"
    });
  });

  it("returns activeSetId=null when nothing is active", async () => {
    const repo: SetRepositoryPort = {
      listSets: async () => [],
      getById: async () => null,
      create: async () => ({ id: "x", name: "x", planId: "x", rootSuiteId: "x", queryId: "x" }),
      update: async () => ({ id: "x", name: "x", planId: "x", rootSuiteId: "x", queryId: "x" }),
      delete: async () => undefined,
      getActiveId: async () => null,
      setActiveId: async () => undefined
    };

    expect(await listSets({ setRepository: repo })).toEqual({ sets: [], activeSetId: null });
  });
});
