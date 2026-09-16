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
  it("preserves every approved v2 color in the existing per-set lists", () => {
    const colors = ["blue", "orange", "green", "violet", "red", "teal", "yellow", "gray"];
    const rules = colors.map((color, index) => ({ ...rule, id: `color-${index}`, color }));
    expect(sanitizeSetColorRules({ bugs: rules })).toEqual({ bugs: rules });
  });
  it("persists valid custom hex colors and discards unsafe or incomplete values", () => {
    const custom = { ...rule, id: "custom", color: "#3A7fC2" };
    const invalid = ["#fff", "#1234567", "#12gg45", "red; color: blue", "var(--color-primary)"]
      .map((color, index) => ({ ...rule, id: `invalid-${index}`, color }));
    expect(sanitizeSetColorRules({ testCases: [custom, ...invalid] })).toEqual({ testCases: [custom] });
  });
  it("keeps rule names and the shared label visibility setting per set", () => {
    expect(sanitizeSetColorRules({ bugs: [{ ...rule, label: "  Login-Probleme  " }], showBugLabels: false }))
      .toEqual({ bugs: [{ ...rule, label: "Login-Probleme" }], showBugLabels: false });
    expect(sanitizeSetColorRules({ showBugLabels: true })).toEqual({ showBugLabels: true });
    expect(sanitizeSetColorRules({ bugs: [{ ...rule, label: "   " }], showBugLabels: "false" }))
      .toEqual({ bugs: [rule] });
  });
});
