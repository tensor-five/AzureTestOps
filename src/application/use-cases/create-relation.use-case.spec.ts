import { describe, expect, it, vi } from "vitest";

import { createRelation } from "./create-relation.use-case.js";
import type { RelationPort } from "../ports/relation.port.js";

const makeRelations = (): RelationPort => ({
  addRelation: vi.fn(async () => undefined),
  removeRelation: vi.fn(async () => undefined)
});

describe("createRelation", () => {
  it("delegates to the port with the validated link", async () => {
    const relations = makeRelations();
    await createRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 }, { relations });
    expect(relations.addRelation).toHaveBeenCalledWith({
      sourceWorkItemId: 101,
      targetWorkItemId: 202
    });
  });

  it.each([
    { sourceWorkItemId: 0, targetWorkItemId: 202, expected: /sourceWorkItemId/ },
    { sourceWorkItemId: -1, targetWorkItemId: 202, expected: /sourceWorkItemId/ },
    { sourceWorkItemId: Number.NaN, targetWorkItemId: 202, expected: /sourceWorkItemId/ },
    { sourceWorkItemId: 101, targetWorkItemId: 0, expected: /targetWorkItemId/ },
    { sourceWorkItemId: 101, targetWorkItemId: 101, expected: /source and target must differ/ }
  ])("rejects invalid input ($sourceWorkItemId → $targetWorkItemId)", async ({ sourceWorkItemId, targetWorkItemId, expected }) => {
    const relations = makeRelations();
    await expect(
      createRelation({ sourceWorkItemId, targetWorkItemId }, { relations })
    ).rejects.toThrow(expected);
    expect(relations.addRelation).not.toHaveBeenCalled();
  });
});
