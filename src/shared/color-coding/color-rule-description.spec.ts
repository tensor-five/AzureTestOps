import { describe, expect, it } from "vitest";
import type { ColorRule } from "../../domain/color-coding/color-rule.js";
import { describeColorRule } from "./color-rule-description.js";

describe("color rule description", () => {
  it.each<[ColorRule["comparison"], ColorRule["color"], string]>([
    ["contains", "blue", "Color rule: Title contains “Login” (Blue)"],
    ["notContains", "orange", "Color rule: Title does not contain “Login” (Orange)"],
    ["startsWith", "green", "Color rule: Title starts with “Login” (Green)"],
    ["equals", "violet", "Color rule: Title equals “Login” (Violet)"]
  ])("explains %s using readable words", (comparison, color, description) => {
    expect(describeColorRule({ id: "title-rule", field: "title", comparison, value: "Login", color })).toBe(description);
  });

  it.each<[ColorRule["field"], string]>([["state", "State"], ["tag", "Tag"]])(
    "names the %s field and preserves the literal search value",
    (field, label) => {
      expect(describeColorRule({ id: "field-rule", field, comparison: "equals", value: " Regression.* ", color: "blue" }))
        .toBe(`Color rule: ${label} equals “ Regression.* ” (Blue)`);
    }
  );

  it("adds no explanation when no rule applies", () => {
    expect(describeColorRule(undefined)).toBeUndefined();
  });
});
