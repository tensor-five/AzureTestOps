type OutcomeDisplay = { slug: string; shortLabel: string; label: string };

const OUTCOME_TABLE: Record<string, OutcomeDisplay> = {
  unspecified: { slug: "active", shortLabel: "ACT", label: "Active" },
  active: { slug: "active", shortLabel: "ACT", label: "Active" },
  passed: { label: "Passed", slug: "passed", shortLabel: "✓" },
  failed: { label: "Failed", slug: "failed", shortLabel: "✗" },
  blocked: { label: "Blocked", slug: "blocked", shortLabel: "■" },
  notapplicable: { label: "NotApplicable", slug: "notapplicable", shortLabel: "N/A" },
  notrun: { label: "NotRun", slug: "notrun", shortLabel: "—" }
};

export function outcomeDisplay(outcome: string): OutcomeDisplay {
  const lowered = outcome.toLowerCase();
  if (Object.hasOwn(OUTCOME_TABLE, lowered)) {
    return OUTCOME_TABLE[lowered];
  }
  return {
    slug: "other",
    label: outcome || "Unknown",
    shortLabel: outcome ? outcome.slice(0, 3).toUpperCase() : "—"
  };
}
