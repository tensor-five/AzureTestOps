import { describe, expect, it } from "vitest";
import type { ColorRule } from "../../domain/color-coding/color-rule.js";
import { colorRuleVisibleLabel } from "./color-rule-visible-label.js";

const rule: ColorRule = { id: "login", field: "title", comparison: "contains", value: " Login ", color: "blue" };

describe("visible color rule label", () => {
  it("uses a saved name and falls back to the existing rule value", () => {
    expect(colorRuleVisibleLabel({ ...rule, label: "  Login-Probleme  " })).toBe("Login-Probleme");
    expect(colorRuleVisibleLabel(rule)).toBe("Login");
  });
});
