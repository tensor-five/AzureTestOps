import type { ColorRule } from "../../domain/color-coding/color-rule.js";
import { colorRuleColorLabel } from "./color-rule-palette.js";

const FIELD_LABELS: Record<ColorRule["field"], string> = {
  title: "Title",
  state: "State",
  tag: "Tag"
};

const COMPARISON_LABELS: Record<ColorRule["comparison"], string> = {
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  equals: "equals"
};

/** The same explanation is used by card tooltips and assistive technology. */
export function describeColorRule(rule: ColorRule | undefined): string | undefined {
  if (!rule) return undefined;
  return `Color rule: ${FIELD_LABELS[rule.field]} ${COMPARISON_LABELS[rule.comparison]} “${rule.value}” (${colorRuleColorLabel(rule.color)})`;
}
