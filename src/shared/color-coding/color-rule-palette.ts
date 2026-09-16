import { COLOR_RULE_COLORS, isCustomColorRuleColor, type ColorRuleColor, type ColorRulePreset } from "../../domain/color-coding/color-rule.js";

const COLOR_LABELS: Record<ColorRulePreset, string> = {
  blue: "Blue",
  orange: "Orange",
  green: "Green",
  violet: "Violet",
  red: "Red",
  teal: "Teal",
  yellow: "Yellow",
  gray: "Gray"
};

export const COLOR_RULE_PALETTE = COLOR_RULE_COLORS.map(value => ({
  value,
  label: COLOR_LABELS[value]
}));

export function colorRuleColorLabel(color: ColorRuleColor): string {
  return isCustomColorRuleColor(color) ? `Custom ${color.toUpperCase()}` : COLOR_LABELS[color];
}
