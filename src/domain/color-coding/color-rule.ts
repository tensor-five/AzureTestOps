export const COLOR_RULE_COLORS = ["blue", "orange", "green", "violet", "red", "teal", "yellow", "gray"] as const;
export type ColorRuleColor = typeof COLOR_RULE_COLORS[number];

/** Ordered, single-predicate presentation rules. No framework or persistence dependencies. */
export type ColorRule = {
  id: string;
  field: "title" | "state" | "tag";
  comparison: "contains" | "notContains" | "startsWith" | "equals";
  value: string;
  color: ColorRuleColor;
};

export type ColorRuleSubject = {
  title: string;
  state: string;
  tags: readonly string[];
};

export function resolveColorRule(subject: ColorRuleSubject, rules: readonly ColorRule[]): ColorRule | undefined {
  return rules.find(rule => matchesColorRule(subject, rule));
}

export function isColorRuleColor(value: unknown): value is ColorRuleColor {
  return typeof value === "string" && COLOR_RULE_COLORS.some(color => color === value);
}

function matchesColorRule(subject: ColorRuleSubject, rule: ColorRule): boolean {
  if (rule.value.trim().length === 0) return false;
  const needle = rule.value.toLowerCase();
  if (rule.field === "tag") return subject.tags.some(tag => tag.toLowerCase() === needle);
  if (rule.field === "state") return subject.state.toLowerCase() === needle;
  const title = subject.title.toLowerCase();
  switch (rule.comparison) {
    case "contains": return title.includes(needle);
    case "notContains": return !title.includes(needle);
    case "startsWith": return title.startsWith(needle);
    case "equals": return title === needle;
  }
}
