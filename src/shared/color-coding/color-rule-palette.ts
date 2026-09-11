import { COLOR_RULE_COLORS, type ColorRuleColor } from "../../domain/color-coding/color-rule.js";

const COLOR_LABELS: Record<ColorRuleColor, string> = {
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
  return COLOR_LABELS[color];
}
