import { describe, expect, it, vi } from "vitest";

import { deleteRelation } from "./delete-relation.use-case.js";
import type { RelationPort } from "../ports/relation.port.js";

const makeRelations = (): RelationPort => ({
  addRelation: vi.fn(async () => undefined),
  removeRelation: vi.fn(async () => undefined)
});

describe("deleteRelation", () => {
  it("delegates to the port with the validated link", async () => {
    const relations = makeRelations();
    await deleteRelation({ sourceWorkItemId: 101, targetWorkItemId: 202 }, { relations });
    expect(relations.removeRelation).toHaveBeenCalledWith({
      sourceWorkItemId: 101,
      targetWorkItemId: 202
    });
  });

  it("rejects self-relations", async () => {
    const relations = makeRelations();
    await expect(
      deleteRelation({ sourceWorkItemId: 7, targetWorkItemId: 7 }, { relations })
    ).rejects.toThrow(/source and target must differ/);
    expect(relations.removeRelation).not.toHaveBeenCalled();
  });

  it("rejects non-positive ids", async () => {
    const relations = makeRelations();
    await expect(
      deleteRelation({ sourceWorkItemId: 5, targetWorkItemId: -1 }, { relations })
    ).rejects.toThrow(/targetWorkItemId/);
    expect(relations.removeRelation).not.toHaveBeenCalled();
  });
});
