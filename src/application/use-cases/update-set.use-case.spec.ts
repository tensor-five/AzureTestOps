import { describe, expect, it, vi } from "vitest";

import { updateSet } from "./update-set.use-case.js";
import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { SetRepositoryPort } from "../ports/set-repository.port.js";

describe("updateSet", () => {
  it("forwards trimmed patch fields to the repository", async () => {
    const update = vi.fn(async (id: string, patch: Partial<SetDraft>) => ({
      id,
      name: patch.name ?? "name",
      planId: patch.planId ?? "1",
      rootSuiteId: patch.rootSuiteId ?? "2",
      queryId: patch.queryId ?? "3"
    }) as Set);

    await updateSet(
      { setId: "s1", patch: { name: "  Renamed  ", planId: "  100  " } },
      { setRepository: stub({ update }) }
    );

    expect(update).toHaveBeenCalledWith("s1", { name: "Renamed", planId: "100" });
  });

  it("normalizes blank optional fields to undefined for explicit clearing", async () => {
    const update = vi.fn(async () => ({
      id: "s1", name: "n", planId: "1", rootSuiteId: "2", queryId: "3"
    }) as Set);

    await updateSet(
      { setId: "s1", patch: { planName: "   ", organization: "" } },
      { setRepository: stub({ update }) }
    );

    expect(update).toHaveBeenCalledWith("s1", { planName: undefined, organization: undefined });
  });

  it("rejects required fields when explicitly emptied", async () => {
    const repo = stub();
    await expect(
      updateSet({ setId: "s1", patch: { planId: "" } }, { setRepository: repo })
    ).rejects.toThrow(/"planId" must be a non-empty string/);
  });

  it("rejects an empty setId", async () => {
    const repo = stub();
    await expect(
      updateSet({ setId: "  ", patch: { name: "x" } }, { setRepository: repo })
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
