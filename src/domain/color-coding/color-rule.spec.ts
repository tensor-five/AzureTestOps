import { describe, expect, it } from "vitest";

// Dynamic loading lets the contract phase stay red by assertion before the domain module exists.
// These types are test-harness coordination only; the approved HTML defines behavior.
type Rule = { id: string; field: "title" | "state" | "tag"; comparison: "contains" | "notContains" | "startsWith" | "equals"; value: string; color: "blue" | "orange" | "green" | "violet" };
type Item = { title: string; state: string; tags: string[] };
type Evaluator = (item: Item, rules: readonly Rule[]) => Rule | undefined;
async function evaluator(): Promise<Evaluator> {
  const modulePath = "./color-rule.js";
  const module = await import(/* @vite-ignore */ modulePath).catch(() => null);
  expect(module, "The contract requires a color-rule evaluator").not.toBeNull();
  return module.resolveColorRule;
}
const item: Item = { title: "Login.* prüfen", state: "Ready", tags: ["Regression erweitert", "Smoke"] };
const rule = (patch: Partial<Rule> = {}): Rule => ({ id: "rule", field: "title", comparison: "contains", value: "Login", color: "blue", ...patch });

describe("approved color coding domain behavior", () => {
  it("CC-04 evaluates literal case-insensitive title comparisons", async () => {
    const resolveColorRule = await evaluator();
    for (const [comparison, value, match] of [
      ["contains", "LOGIN.*", true], ["contains", "^Login", false], ["notContains", "LOGIN", false],
      ["notContains", "Export", true], ["startsWith", "login", true], ["startsWith", "prüfen", false],
      ["equals", "LOGIN.* PRÜFEN", true], ["equals", "Login", false]
    ] as const) expect(Boolean(resolveColorRule(item, [rule({ comparison, value })]))).toBe(match);
  });
  it("CC-03 compares whole tags and states", async () => {
    const resolveColorRule = await evaluator();
    expect(resolveColorRule(item, [rule({ field: "state", comparison: "equals", value: "Ready" })])).toBeDefined();
    expect(resolveColorRule(item, [rule({ field: "state", comparison: "equals", value: "Read" })])).toBeUndefined();
    expect(resolveColorRule(item, [rule({ field: "tag", comparison: "equals", value: "Regression" })])).toBeUndefined();
    expect(resolveColorRule(item, [rule({ field: "tag", comparison: "equals", value: "Smoke" })])).toBeDefined();
  });
  it("CC-05 ignores blank input for all comparisons and preserves meaningful spaces", async () => {
    const resolveColorRule = await evaluator();
    for (const comparison of ["contains", "notContains", "startsWith", "equals"] as const) {
      for (const value of ["", "   "]) expect(resolveColorRule(item, [rule({ comparison, value })])).toBeUndefined();
    }
    expect(resolveColorRule(item, [rule({ value: " Login" })])).toBeUndefined();
    expect(resolveColorRule(item, [rule({ value: " prüfen" })])).toBeDefined();
  });
  it("CC-06 resolves the first matching rule without mutating items or order", async () => {
    const resolveColorRule = await evaluator();
    const rules = Object.freeze([rule(), rule({ id: "second", color: "orange" })]);
    const frozenItem = Object.freeze({ ...item, tags: [...item.tags] });
    expect(resolveColorRule(frozenItem, rules)).toBe(rules[0]);
    expect(resolveColorRule(item, [])).toBeUndefined();
    expect(rules.map(r => r.id)).toEqual(["rule", "second"]);
  });
});
