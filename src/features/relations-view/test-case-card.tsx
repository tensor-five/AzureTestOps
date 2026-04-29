import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { ItemPosition, ItemPositioningApi } from "./use-item-positioning.js";
import { testCaseItemKey } from "./item-key.js";

export type TestCaseCardProps = {
  projection: TestCaseProjection;
  positioning: ItemPositioningApi;
};

export function TestCaseCard(props: TestCaseCardProps): React.ReactElement {
  const { projection, positioning } = props;
  const itemKey = testCaseItemKey(projection.workItemId, projection.suiteId);
  const offset = positioning.getOffset(itemKey);
  const dragging = positioning.isDragging(itemKey);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      positioning.startDrag(itemKey, event);
    },
    [positioning, itemKey]
  );

  return (
    <article
      className={cardClassName(dragging, positioning.enabled, projection.lastOutcome)}
      style={cardTransformStyle(offset)}
      onPointerDown={handlePointerDown}
      data-relations-anchor="left"
      data-item-key={itemKey}
    >
      <header className="relations-view-card-header">
        <span className="relations-view-card-id">#{projection.workItemId}</span>
        <OutcomeChip outcome={projection.lastOutcome} />
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

function cardTransformStyle(offset: ItemPosition): React.CSSProperties {
  if (offset.x === 0 && offset.y === 0) {
    return {};
  }
  return { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` };
}

function cardClassName(dragging: boolean, enabled: boolean, outcome: string): string {
  const parts = ["relations-view-card", "relations-view-card-test-case"];
  parts.push(`relations-view-card-outcome-${outcomeSlug(outcome)}`);
  if (enabled) {
    parts.push("relations-view-card-draggable");
  }
  if (dragging) {
    parts.push("relations-view-card-dragging");
  }
  return parts.join(" ");
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

function OutcomeChip(props: { outcome: string }): React.ReactElement {
  return (
    <span className={`relations-view-outcome-chip relations-view-outcome-chip-${outcomeSlug(props.outcome)}`}>
      {props.outcome || "—"}
    </span>
  );
}
