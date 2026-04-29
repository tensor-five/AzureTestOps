import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { WorkItemCard } from "./work-item-card.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";

export type WorkItemColumnProps = {
  /** Already filtered by the active filter bar. */
  workItems: readonly WorkItem[];
  unfilteredCount: number;
  positioning: ItemPositioningApi;
  filterBar?: React.ReactNode;
  onEditPointerDown?: (itemKey: string, event: React.PointerEvent<HTMLElement>) => void;
};

export function WorkItemColumn(props: WorkItemColumnProps): React.ReactElement {
  const sorted = React.useMemo(
    () => props.workItems.slice().sort((a, b) => a.id - b.id),
    [props.workItems]
  );

  return (
    <section className="relations-view-column relations-view-column-work-items" aria-label="Work items">
      <header className="relations-view-column-header">
        <h3>Work Items</h3>
        <span className="relations-view-column-count">
          {sorted.length === props.unfilteredCount
            ? props.unfilteredCount
            : `${sorted.length} / ${props.unfilteredCount}`}
        </span>
      </header>
      {props.filterBar}
      {props.unfilteredCount === 0 ? (
        <p className="relations-view-column-empty">No work items returned by the saved query.</p>
      ) : sorted.length === 0 ? (
        <p className="relations-view-column-empty">No work items match the active filter.</p>
      ) : (
        <ol className="relations-view-work-item-list">
          {sorted.map((workItem) => (
            <li key={workItem.id} className="relations-view-work-item-list-item">
              <WorkItemCard
                workItem={workItem}
                positioning={props.positioning}
                onEditPointerDown={props.onEditPointerDown}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
