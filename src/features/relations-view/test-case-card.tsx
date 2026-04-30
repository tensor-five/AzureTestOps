import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { testCaseItemKey } from "./item-key.js";

export type TestCaseCardProps = {
  projection: TestCaseProjection;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
  /** Resolves the Azure DevOps deep link for a work item id, or null if unavailable. */
  getWorkItemHref?: (workItemId: number) => string | null;
};

type OutcomeDisplay = { slug: string; shortLabel: string };

const OUTCOME_TABLE: Record<string, OutcomeDisplay> = {
  passed: { slug: "passed", shortLabel: "✓" },
  failed: { slug: "failed", shortLabel: "✗" },
  blocked: { slug: "blocked", shortLabel: "■" },
  notapplicable: { slug: "notapplicable", shortLabel: "N/A" },
  notrun: { slug: "notrun", shortLabel: "—" }
};

function outcomeDisplay(outcome: string): OutcomeDisplay {
  const lowered = outcome.toLowerCase();
  if (lowered in OUTCOME_TABLE) {
    return OUTCOME_TABLE[lowered];
  }
  return {
    slug: "other",
    shortLabel: outcome ? outcome.slice(0, 3).toUpperCase() : "—"
  };
}

export function TestCaseCard(props: TestCaseCardProps): React.ReactElement {
  const { projection, onLinePointerDown, getWorkItemHref } = props;
  const itemKey = testCaseItemKey(projection.workItemId, projection.suiteId);
  const display = outcomeDisplay(projection.lastOutcome);
  const href = getWorkItemHref?.(projection.workItemId) ?? null;

  const className = [
    "relations-view-card",
    "relations-view-card-test-case",
    `relations-view-card-outcome-${display.slug}`,
    onLinePointerDown ? "relations-view-card-line-source" : null
  ]
    .filter(Boolean)
    .join(" ");

  const handlePointerDown = onLinePointerDown
    ? (event: React.PointerEvent<HTMLElement>) => onLinePointerDown(itemKey, event)
    : undefined;

  return (
    <article
      className={className}
      data-relations-anchor="left"
      data-item-key={itemKey}
      title={buildTooltip(projection)}
    >
      {href ? (
        <a
          className="relations-view-card-id"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Open test case #${projection.workItemId} in Azure DevOps (new tab)`}
        >
          #{projection.workItemId}
        </a>
      ) : (
        <span className="relations-view-card-id">#{projection.workItemId}</span>
      )}
      <span
        className={`relations-view-outcome-chip relations-view-outcome-chip-${display.slug}`}
        aria-label={`Outcome: ${projection.lastOutcome || "Unknown"}`}
      >
        {display.shortLabel}
      </span>
      <span className="relations-view-card-title">{projection.title}</span>
      {handlePointerDown ? (
        <span
          className="relations-view-card-line-anchor relations-view-card-line-anchor-right"
          onPointerDown={handlePointerDown}
          role="button"
          aria-label={`Drag to create related link from test case #${projection.workItemId}`}
        />
      ) : null}
    </article>
  );
}

function buildTooltip(p: TestCaseProjection): string {
  const lines = [
    `#${p.workItemId} — ${p.title}`,
    `Outcome: ${p.lastOutcome || "—"}`,
    `State: ${p.state || "—"}`,
    `Assigned: ${p.assignedTo ?? "—"}`,
    `Suite: ${p.suitePath}`
  ];
  if (p.tags.length > 0) {
    lines.push(`Tags: ${p.tags.join(", ")}`);
  }
  return lines.join("\n");
}
