import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { workItemItemKey } from "./item-key.js";

export type WorkItemCardProps = {
  workItem: WorkItem;
  onLinePointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
};

export function WorkItemCard(props: WorkItemCardProps): React.ReactElement {
  const { workItem, onLinePointerDown } = props;
  const itemKey = workItemItemKey(workItem.id);
  const typeSlug = workItemTypeSlug(workItem.workItemType);

  const className = [
    "relations-view-card",
    "relations-view-card-work-item",
    `relations-view-card-type-${typeSlug}`,
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
      onPointerDown={handlePointerDown}
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
  const initials = trimmed
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  if (initials.length >= 2) {
    return initials;
  }
  return trimmed.slice(0, 3).toUpperCase();
}
