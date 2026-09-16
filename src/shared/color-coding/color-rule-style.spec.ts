import { describe, expect, it } from "vitest";
import { customColorRuleStyle } from "./color-rule-style.js";

describe("custom color rule styling", () => {
  it("sets the applied color only for a validated custom hex value", () => {
    expect(customColorRuleStyle("#3a7fc2")).toEqual({ "--color-rule-applied": "#3a7fc2" });
    expect(customColorRuleStyle("blue")).toBeUndefined();
    expect(customColorRuleStyle("#123456; background: red" as "#123456")).toBeUndefined();
  });
});
