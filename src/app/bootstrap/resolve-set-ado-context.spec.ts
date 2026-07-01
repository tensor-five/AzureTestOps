import { describe, expect, it } from "vitest";

import { resolveSetAdoContext } from "./resolve-set-ado-context.js";

describe("resolveSetAdoContext", () => {
  it("uses a complete set-level context before the persisted fallback", () => {
    expect(
      resolveSetAdoContext(
        { organization: " set-org ", project: " Set Project " },
        { organization: "fallback-org", project: "Fallback Project" }
      )
    ).toEqual({ organization: "set-org", project: "Set Project" });
  });

  it("falls back when the set-level context is incomplete", () => {
    expect(
      resolveSetAdoContext(
        { organization: "set-org", project: undefined },
        { organization: "fallback-org", project: "Fallback Project" }
      )
    ).toEqual({ organization: "fallback-org", project: "Fallback Project" });
  });

  it("returns null when neither source has a complete context", () => {
    expect(resolveSetAdoContext({ organization: "", project: "" }, null)).toBeNull();
  });
});
