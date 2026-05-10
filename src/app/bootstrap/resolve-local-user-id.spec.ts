import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveLocalUserId } from "./resolve-local-user-id.js";

describe("resolveLocalUserId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers the USER env var", () => {
    expect(resolveLocalUserId({ USER: "alice" })).toBe("alice");
  });

  it("falls back to USERNAME when USER is missing", () => {
    expect(resolveLocalUserId({ USERNAME: "bob" })).toBe("bob");
  });

  it("trims whitespace from env-provided names", () => {
    expect(resolveLocalUserId({ USER: "  carol  " })).toBe("carol");
  });

  it("falls back to os.userInfo() when env vars are blank", () => {
    vi.spyOn(os, "userInfo").mockReturnValue({
      username: "from-os",
      uid: 0,
      gid: 0,
      shell: null,
      homedir: "/tmp"
    });
    expect(resolveLocalUserId({ USER: "  " })).toBe("from-os");
  });

  it("returns 'local-user' when os.userInfo() throws", () => {
    vi.spyOn(os, "userInfo").mockImplementation(() => {
      throw new Error("sandbox: userInfo unavailable");
    });
    expect(resolveLocalUserId({})).toBe("local-user");
  });

  it("returns 'local-user' when os.userInfo() yields a blank username", () => {
    vi.spyOn(os, "userInfo").mockReturnValue({
      username: "",
      uid: 0,
      gid: 0,
      shell: null,
      homedir: "/tmp"
    });
    expect(resolveLocalUserId({})).toBe("local-user");
  });
});
