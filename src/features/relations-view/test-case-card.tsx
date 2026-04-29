import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";
import { testCaseItemKey } from "./item-key.js";
import { buildDraggableCardSurface } from "./draggable-card.js";

export type TestCaseCardProps = {
  projection: TestCaseProjection;
  positioning: ItemPositioningApi;
  onEditPointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
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
  const { projection, positioning } = props;
  const itemKey = testCaseItemKey(projection.workItemId, projection.suiteId);
  const display = outcomeDisplay(projection.lastOutcome);

  const surface = buildDraggableCardSurface(
    positioning,
    itemKey,
    [
      "relations-view-card",
      "relations-view-card-test-case",
      `relations-view-card-outcome-${display.slug}`
    ],
    { editPointerDown: props.onEditPointerDown }
  );

  return (
    <article
      className={surface.className}
      style={surface.style}
      onPointerDown={surface.onPointerDown}
      data-relations-anchor="left"
      data-item-key={itemKey}
      title={buildTooltip(projection)}
    >
      <span className="relations-view-card-id">#{projection.workItemId}</span>
      <span
        className={`relations-view-outcome-chip relations-view-outcome-chip-${display.slug}`}
        aria-label={`Outcome: ${projection.lastOutcome || "Unknown"}`}
      >
        {display.shortLabel}
      </span>
      <span className="relations-view-card-title">{projection.title}</span>
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
