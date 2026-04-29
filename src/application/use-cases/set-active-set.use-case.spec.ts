import { describe, expect, it, vi } from "vitest";

import { setActiveSet } from "./set-active-set.use-case.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

describe("setActiveSet", () => {
  it("activates the trimmed set id", async () => {
    const setActiveId = vi.fn(async () => undefined);
    await setActiveSet({ setId: "  s1  " }, { setRepository: stub({ setActiveId }) });
    expect(setActiveId).toHaveBeenCalledWith("s1");
  });

  it("clears the active pointer when null is passed", async () => {
    const setActiveId = vi.fn(async () => undefined);
    await setActiveSet({ setId: null }, { setRepository: stub({ setActiveId }) });
    expect(setActiveId).toHaveBeenCalledWith(null);
  });

  it("rejects an empty string id", async () => {
    await expect(
      setActiveSet({ setId: "  " }, { setRepository: stub() })
    ).rejects.toThrow(/non-empty string or null/);
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
