import { isColorRuleColor, type ColorRule } from "../../domain/color-coding/color-rule.js";

export type SetColorRules = { testCases?: ColorRule[]; bugs?: ColorRule[] };
export type SetColorRulesBySetId = Record<string, SetColorRules>;

export function sanitizeSetColorRules(value: unknown): SetColorRules | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const next: SetColorRules = {};
  for (const key of ["testCases", "bugs"] as const) {
    if (!Array.isArray(candidate[key])) continue;
    const seen = new Set<string>();
    next[key] = candidate[key].flatMap(raw => {
      const rule = sanitizeColorRule(raw);
      if (!rule || seen.has(rule.id)) return [];
      seen.add(rule.id);
      return [rule];
    });
  }
  return Object.keys(next).length > 0 ? next : null;
}

function sanitizeColorRule(value: unknown): ColorRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  if (typeof rule.id !== "string" || !rule.id.trim() || typeof rule.value !== "string") return null;
  if (rule.field !== "title" && rule.field !== "state" && rule.field !== "tag") return null;
  if (rule.comparison !== "contains" && rule.comparison !== "notContains" && rule.comparison !== "startsWith" && rule.comparison !== "equals") return null;
  if (rule.field !== "title" && rule.comparison !== "equals") return null;
  if (!isColorRuleColor(rule.color)) return null;
  return { id: rule.id.trim(), field: rule.field, comparison: rule.comparison, value: rule.value, color: rule.color };
}
