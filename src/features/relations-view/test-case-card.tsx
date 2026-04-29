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

export function TestCaseCard(props: TestCaseCardProps): React.ReactElement {
  const { projection, positioning } = props;
  const itemKey = testCaseItemKey(projection.workItemId, projection.suiteId);
  const slug = outcomeSlug(projection.lastOutcome);

  const surface = buildDraggableCardSurface(
    positioning,
    itemKey,
    [
      "relations-view-card",
      "relations-view-card-test-case",
      `relations-view-card-outcome-${slug}`
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
    >
      <header className="relations-view-card-header">
        <span className="relations-view-card-id">#{projection.workItemId}</span>
        <span className={`relations-view-outcome-chip relations-view-outcome-chip-${slug}`}>
          {projection.lastOutcome || "—"}
        </span>
      </header>
      <h4 className="relations-view-card-title">{projection.title}</h4>
      <dl className="relations-view-card-meta">
        <div>
          <dt>State</dt>
          <dd>{projection.state || "—"}</dd>
        </div>
        <div>
          <dt>Assigned</dt>
          <dd>{projection.assignedTo ?? "—"}</dd>
        </div>
        <div>
          <dt>Suite</dt>
          <dd title={projection.suitePath}>{projection.suitePath}</dd>
        </div>
      </dl>
    </article>
  );
}

function outcomeSlug(outcome: string): string {
  const lowered = outcome.toLowerCase();
  switch (lowered) {
    case "passed":
    case "failed":
    case "blocked":
    case "notapplicable":
    case "notrun":
      return lowered;
    default:
      return "other";
  }
}
