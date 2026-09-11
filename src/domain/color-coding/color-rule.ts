/** Ordered, single-predicate presentation rules. No framework or persistence dependencies. */
export type ColorRule = {
  id: string;
  field: "title" | "state" | "tag";
  comparison: "contains" | "notContains" | "startsWith" | "equals";
  value: string;
  color: "blue" | "orange" | "green" | "violet";
};

export type ColorRuleSubject = {
  title: string;
  state: string;
  tags: readonly string[];
};

export function resolveColorRule(subject: ColorRuleSubject, rules: readonly ColorRule[]): ColorRule | undefined {
  return rules.find(rule => matchesColorRule(subject, rule));
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
