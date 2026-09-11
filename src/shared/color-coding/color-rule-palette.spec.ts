import { describe, expect, it } from "vitest";
import { COLOR_RULE_PALETTE, colorRuleColorLabel } from "./color-rule-palette.js";

describe("color rule palette", () => {
  it("exposes each approved color once with its visible label", () => {
    expect(COLOR_RULE_PALETTE).toEqual([
      { value: "blue", label: "Blue" },
      { value: "orange", label: "Orange" },
      { value: "green", label: "Green" },
      { value: "violet", label: "Violet" },
      { value: "red", label: "Red" },
      { value: "teal", label: "Teal" },
      { value: "yellow", label: "Yellow" },
      { value: "gray", label: "Gray" }
    ]);
    expect(COLOR_RULE_PALETTE.map(color => colorRuleColorLabel(color.value))).toEqual(
      COLOR_RULE_PALETTE.map(color => color.label)
    );
  });
});
