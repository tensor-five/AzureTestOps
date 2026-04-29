import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";
import { workItemItemKey } from "./item-key.js";
import { buildDraggableCardSurface } from "./draggable-card.js";

export type WorkItemCardProps = {
  workItem: WorkItem;
  positioning: ItemPositioningApi;
  onEditPointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
};

export function WorkItemCard(props: WorkItemCardProps): React.ReactElement {
  const { workItem, positioning } = props;
  const itemKey = workItemItemKey(workItem.id);
  const typeSlug = workItemTypeSlug(workItem.workItemType);

  const surface = buildDraggableCardSurface(
    positioning,
    itemKey,
    [
      "relations-view-card",
      "relations-view-card-work-item",
      `relations-view-card-type-${typeSlug}`
    ],
    { editPointerDown: props.onEditPointerDown }
  );

  return (
    <article
      className={surface.className}
      style={surface.style}
      onPointerDown={surface.onPointerDown}
      data-relations-anchor="right"
      data-item-key={itemKey}
      title={buildTooltip(workItem)}
    >
      <span className="relations-view-card-id">#{workItem.id}</span>
      <span
        className={`relations-view-type-chip relations-view-type-chip-${typeSlug}`}
        aria-label={`Type: ${workItem.workItemType || "Unknown"}`}
      >
        {workItemShortType(workItem.workItemType)}
      </span>
      <span className="relations-view-card-title">{workItem.title}</span>
    </article>
  );
}

function buildTooltip(wi: WorkItem): string {
  const lines = [
    `#${wi.id} — ${wi.title}`,
    `Type: ${wi.workItemType || "Unknown"}`,
    `State: ${wi.state || "—"}`,
    `Assigned: ${wi.assignedTo ?? "—"}`
  ];
  if (wi.tags.length > 0) {
    lines.push(`Tags: ${wi.tags.join(", ")}`);
  }
  if (wi.areaPath) {
    lines.push(`Area: ${wi.areaPath}`);
  }
  return lines.join("\n");
}

function workItemTypeSlug(type: string): string {
  const trimmed = type.trim().toLowerCase().replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed : "unknown";
}

function workItemShortType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) {
    return "—";
  }
  // Keep the chip narrow — most ADO type names fit in 3-4 chars when shortened
  // by their leading capitals (e.g. "User Story" → "US", "Bug" → "BUG").
  const initials = trimmed
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  if (initials.length >= 2) {
    return initials;
  }
  return trimmed.slice(0, 3).toUpperCase();
}
