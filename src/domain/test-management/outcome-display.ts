type OutcomeDisplay = { slug: string; shortLabel: string };

const OUTCOME_TABLE: Record<string, OutcomeDisplay> = {
  passed: { slug: "passed", shortLabel: "✓" },
  failed: { slug: "failed", shortLabel: "✗" },
  blocked: { slug: "blocked", shortLabel: "■" },
  notapplicable: { slug: "notapplicable", shortLabel: "N/A" },
  notrun: { slug: "notrun", shortLabel: "—" }
};

export function outcomeDisplay(outcome: string): OutcomeDisplay {
  const lowered = outcome.toLowerCase();
  if (Object.hasOwn(OUTCOME_TABLE, lowered)) {
    return OUTCOME_TABLE[lowered];
  }
  return {
    slug: "other",
    shortLabel: outcome ? outcome.slice(0, 3).toUpperCase() : "—"
  };
}
