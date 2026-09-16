export const COLOR_RULE_COLORS = ["blue", "orange", "green", "violet", "red", "teal", "yellow", "gray"] as const;
export const COLOR_RULE_LABEL_MAX_LENGTH = 60;
export type ColorRulePreset = typeof COLOR_RULE_COLORS[number];
export type ColorRuleColor = ColorRulePreset | `#${string}`;

/** Ordered, single-predicate presentation rules. No framework or persistence dependencies. */
export type ColorRule = {
  id: string;
  field: "title" | "state" | "tag";
  comparison: "contains" | "notContains" | "startsWith" | "equals";
  value: string;
  color: ColorRuleColor;
  label?: string;
};

export type ColorRuleSubject = {
  title: string;
  state: string;
  tags: readonly string[];
};

export function resolveColorRule(subject: ColorRuleSubject, rules: readonly ColorRule[]): ColorRule | undefined {
  return rules.find(rule => matchesColorRule(subject, rule));
}

export type ColorRuleMatchCount = { matches: number; applied: number };

export function countColorRuleMatches(subjects: readonly ColorRuleSubject[], rules: readonly ColorRule[]): ColorRuleMatchCount[] {
  const counts = rules.map(() => ({ matches: 0, applied: 0 }));
  for (const subject of subjects) {
    let firstMatch = true;
    rules.forEach((rule, index) => {
      if (!matchesColorRule(subject, rule)) return;
      counts[index]!.matches += 1;
      if (firstMatch) {
        counts[index]!.applied += 1;
        firstMatch = false;
      }
    });
  }
  return counts;
}

export function moveColorRule(rules: readonly ColorRule[], index: number, direction: -1 | 1): ColorRule[] {
  const next = rules.slice();
  const target = index + direction;
  if (!Number.isInteger(index) || index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function isColorRuleColor(value: unknown): value is ColorRuleColor {
  return typeof value === "string" && (COLOR_RULE_COLORS.some(color => color === value) || isCustomColorRuleColor(value));
}

export function isCustomColorRuleColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
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
