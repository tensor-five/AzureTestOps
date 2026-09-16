import type * as React from "react";
import { isCustomColorRuleColor, type ColorRuleColor } from "../../domain/color-coding/color-rule.js";

export function customColorRuleStyle(color: ColorRuleColor | undefined): React.CSSProperties | undefined {
  return isCustomColorRuleColor(color) ? { "--color-rule-applied": color } as React.CSSProperties : undefined;
}
