import { COLOR_RULE_LABEL_MAX_LENGTH, type ColorRule } from "../../domain/color-coding/color-rule.js";

export function colorRuleVisibleLabel(rule: ColorRule): string {
  return (rule.label?.trim() || rule.value.trim()).slice(0, COLOR_RULE_LABEL_MAX_LENGTH);
}
