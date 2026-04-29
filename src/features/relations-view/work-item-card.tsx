import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";
import { workItemItemKey } from "./item-key.js";
import { buildDraggableCardSurface } from "./draggable-card.js";

export type WorkItemCardProps = {
  workItem: WorkItem;
  positioning: ItemPositioningApi;
};

export function WorkItemCard(props: WorkItemCardProps): React.ReactElement {
  const { workItem, positioning } = props;
  const itemKey = workItemItemKey(workItem.id);
  const typeSlug = workItemTypeSlug(workItem.workItemType);

  const surface = buildDraggableCardSurface(positioning, itemKey, [
    "relations-view-card",
    "relations-view-card-work-item",
    `relations-view-card-type-${typeSlug}`
  ]);

  return (
    <article
      className={surface.className}
      style={surface.style}
      onPointerDown={surface.onPointerDown}
      data-relations-anchor="right"
      data-item-key={itemKey}
    >
      <header className="relations-view-card-header">
        <span className="relations-view-card-id">#{workItem.id}</span>
        <span className={`relations-view-type-chip relations-view-type-chip-${typeSlug}`}>
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

function workItemTypeSlug(type: string): string {
  const trimmed = type.trim().toLowerCase().replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed : "unknown";
}
