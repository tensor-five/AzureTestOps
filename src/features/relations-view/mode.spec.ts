import { describe, expect, it } from "vitest";

import { DEFAULT_MODE, modeLabel, nextMode } from "./mode.js";

describe("RelationsViewMode", () => {
  it("defaults to move-items per §7.3", () => {
    expect(DEFAULT_MODE).toBe("move-items");
  });

  it("toggles between move-items and edit-relations", () => {
    expect(nextMode("move-items")).toBe("edit-relations");
    expect(nextMode("edit-relations")).toBe("move-items");
  });

  it("renders human-readable labels for both modes", () => {
    expect(modeLabel("move-items")).toBe("Move items");
    expect(modeLabel("edit-relations")).toBe("Edit relations");
  });
});
