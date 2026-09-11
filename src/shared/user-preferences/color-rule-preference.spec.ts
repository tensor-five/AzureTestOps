import { describe, expect, it } from "vitest";
import { sanitizeSetColorRules } from "./color-rule-preference.js";

const rule = { id: "login", field: "title", comparison: "notContains", value: " Login ", color: "blue" };
describe("color rule preference sanitizing", () => {
  it("preserves spaces, empty drafts and explicit empty lists", () => {
    expect(sanitizeSetColorRules({ testCases: [rule, { ...rule, id: "blank", value: "" }], bugs: [] })).toEqual({ testCases: [rule, { ...rule, id: "blank", value: "" }], bugs: [] });
  });
  it("rejects invalid fields, comparisons, colors and duplicate ids", () => {
    expect(sanitizeSetColorRules({ testCases: [null, rule, rule, { ...rule, field: "script" }, { ...rule, color: "url(evil)" }, { ...rule, field: "state" }] })).toEqual({ testCases: [rule] });
    expect(sanitizeSetColorRules({ unknown: [] })).toBeNull();
    expect(sanitizeSetColorRules(null)).toBeNull();
  });
});
