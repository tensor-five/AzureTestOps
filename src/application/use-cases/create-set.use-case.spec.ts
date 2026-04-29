import { describe, expect, it, vi } from "vitest";

import { createSet } from "./create-set.use-case.js";
import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

describe("createSet", () => {
  it("trims, validates and persists a draft", async () => {
    const create = vi.fn(async (draft: SetDraft, opts?: { id?: string }) => ({
      id: opts?.id ?? "auto-1",
      ...draft
    }) as Set);
    const setActiveId = vi.fn(async () => undefined);

    const result = await createSet(
      {
        name: "  Sprint 24  ",
        planId: " 100 ",
        rootSuiteId: "200",
        queryId: "Q-A",
        planName: " Release 1 ",
        rootSuiteName: "  ",
        queryName: undefined
      },
      { setRepository: stub({ create, setActiveId }) }
    );

    expect(create).toHaveBeenCalledWith(
      {
        name: "Sprint 24",
        planId: "100",
        rootSuiteId: "200",
        queryId: "Q-A",
        planName: "Release 1",
        rootSuiteName: undefined,
        queryName: undefined,
        organization: undefined,
        project: undefined
      },
      undefined
    );
    expect(setActiveId).not.toHaveBeenCalled();
    expect(result.id).toBe("auto-1");
  });

  it("forwards an explicit id and activates when requested", async () => {
    const create = vi.fn(async (draft: SetDraft, opts?: { id?: string }) => ({
      id: opts?.id ?? "auto",
      ...draft
    }) as Set);
    const setActiveId = vi.fn(async () => undefined);

    const result = await createSet(
      {
        id: "fixed",
        name: "Sprint",
        planId: "1",
        rootSuiteId: "2",
        queryId: "3",
        setActive: true
      },
      { setRepository: stub({ create, setActiveId }) }
    );

    expect(create.mock.calls[0]?.[1]).toEqual({ id: "fixed" });
    expect(setActiveId).toHaveBeenCalledWith("fixed");
    expect(result.id).toBe("fixed");
  });

  it("rejects empty required fields", async () => {
    const create = vi.fn(async () => ({
      id: "x", name: "x", planId: "x", rootSuiteId: "x", queryId: "x"
    }) as Set);
    const repo = stub({ create });
    await expect(
      createSet(
        { name: "", planId: "1", rootSuiteId: "2", queryId: "3" },
        { setRepository: repo }
      )
    ).rejects.toThrow(/"name" is required/);
    await expect(
      createSet(
        { name: "n", planId: "  ", rootSuiteId: "2", queryId: "3" },
        { setRepository: repo }
      )
    ).rejects.toThrow(/"planId" is required/);
    expect(create).not.toHaveBeenCalled();
  });
});

function stub(overrides: Partial<SetRepositoryPort>): SetRepositoryPort {
  return {
    listSets: async () => [],
    getById: async () => null,
    create: async () => ({ id: "x", name: "x", planId: "x", rootSuiteId: "x", queryId: "x" }),
    update: async () => ({ id: "x", name: "x", planId: "x", rootSuiteId: "x", queryId: "x" }),
    delete: async () => undefined,
    getActiveId: async () => null,
    setActiveId: async () => undefined,
    ...overrides
  };
}
