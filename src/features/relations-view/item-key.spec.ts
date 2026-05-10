import { describe, expect, it } from "vitest";

import { parseItemKey, testCaseItemKey, workItemItemKey } from "./item-key.js";

describe("item-key", () => {
  it("round-trips test-case keys", () => {
    const key = testCaseItemKey(101, 7);
    expect(key).toBe("tc:101:7");
    expect(parseItemKey(key)).toEqual({ kind: "test-case", workItemId: 101, suiteId: 7 });
  });

  it("round-trips work-item keys", () => {
    const key = workItemItemKey(501);
    expect(key).toBe("wi:501");
    expect(parseItemKey(key)).toEqual({ kind: "work-item", workItemId: 501 });
  });

  it("returns null for malformed input", () => {
    expect(parseItemKey("xx:1")).toBeNull();
    expect(parseItemKey("tc:abc:1")).toBeNull();
    expect(parseItemKey("")).toBeNull();
  });
});
