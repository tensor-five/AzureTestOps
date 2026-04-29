import { describe, expect, it, vi } from "vitest";

import { deleteSet } from "./delete-set.use-case.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

describe("deleteSet", () => {
  it("delegates to the repository", async () => {
    const del = vi.fn(async () => undefined);
    await deleteSet({ setId: "s1" }, { setRepository: stub({ delete: del }) });
    expect(del).toHaveBeenCalledWith("s1");
  });

  it("trims the input id", async () => {
    const del = vi.fn(async () => undefined);
    await deleteSet({ setId: "  s1  " }, { setRepository: stub({ delete: del }) });
    expect(del).toHaveBeenCalledWith("s1");
  });

  it("rejects empty ids", async () => {
    await expect(
      deleteSet({ setId: "  " }, { setRepository: stub() })
    ).rejects.toThrow(/setId is required/);
  });
});

function stub(overrides: Partial<SetRepositoryPort> = {}): SetRepositoryPort {
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
