import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { ItemPosition, ItemPositioningApi } from "./use-item-positioning.js";
import { workItemItemKey } from "./item-key.js";

export type WorkItemCardProps = {
  workItem: WorkItem;
  positioning: ItemPositioningApi;
};

export function WorkItemCard(props: WorkItemCardProps): React.ReactElement {
  const { workItem, positioning } = props;
  const itemKey = workItemItemKey(workItem.id);
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
      className={cardClassName(dragging, positioning.enabled, workItem.workItemType)}
      style={cardTransformStyle(offset)}
      onPointerDown={handlePointerDown}
      data-relations-anchor="right"
      data-item-key={itemKey}
    >
      <header className="relations-view-card-header">
        <span className="relations-view-card-id">#{workItem.id}</span>
        <span
          className={`relations-view-type-chip relations-view-type-chip-${workItemTypeSlug(
            workItem.workItemType
          )}`}
        >
          {workItem.workItemType || "Unknown"}
        </span>
      </header>
      <h4 className="relations-view-card-title">{workItem.title}</h4>
      <dl className="relations-view-card-meta">
        <div>
          <dt>State</dt>
          <dd>{workItem.state || "—"}</dd>
        </div>
        <div>
          <dt>Assigned</dt>
          <dd>{workItem.assignedTo ?? "—"}</dd>
        </div>
        {workItem.tags.length > 0 ? (
          <div>
            <dt>Tags</dt>
            <dd>{workItem.tags.join(", ")}</dd>
          </div>
        ) : null}
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

function cardClassName(dragging: boolean, enabled: boolean, workItemType: string): string {
  const parts = [
    "relations-view-card",
    "relations-view-card-work-item",
    `relations-view-card-type-${workItemTypeSlug(workItemType)}`
  ];
  if (enabled) {
    parts.push("relations-view-card-draggable");
  }
  if (dragging) {
    parts.push("relations-view-card-dragging");
  }
  return parts.join(" ");
}

function workItemTypeSlug(type: string): string {
  const trimmed = type.trim().toLowerCase().replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed : "unknown";
}
