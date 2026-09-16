import { describe, expect, it } from "vitest";
import { countColorRuleMatches, moveColorRule, resolveColorRule, type ColorRule } from "./color-rule.js";

const titleRule: ColorRule = { id: "login", field: "title", comparison: "contains", value: "Login", color: "blue" };
const stateRule: ColorRule = { id: "active", field: "state", comparison: "equals", value: "Active", color: "orange" };
const subjects = [
  { title: "Login failed", state: "Active", tags: [] },
  { title: "Import failed", state: "Active", tags: [] },
  { title: "Login archived", state: "Closed", tags: [] }
];

describe("ordered color rule feedback", () => {
  it("counts raw matches and effective coloring in the current order", () => {
    expect(countColorRuleMatches(subjects, [titleRule, stateRule])).toEqual([
      { matches: 2, applied: 2 }, { matches: 2, applied: 1 }
    ]);
    expect(countColorRuleMatches(subjects, [stateRule, titleRule])).toEqual([
      { matches: 2, applied: 2 }, { matches: 2, applied: 1 }
    ]);
  });

  it("moves rules without changing their data or mutating the saved order", () => {
    const original = Object.freeze([titleRule, stateRule]);
    const moved = moveColorRule(original, 0, 1);
    expect(moved).toEqual([stateRule, titleRule]);
    expect(resolveColorRule(subjects[0]!, moved)).toBe(stateRule);
    expect(original).toEqual([titleRule, stateRule]);
    expect(moveColorRule(original, 0, -1)).toEqual(original);
    expect(moveColorRule(original, 1, 1)).toEqual(original);
    expect(moveColorRule(original, 2, -1)).toEqual(original);
  });
});
