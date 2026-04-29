import * as React from "react";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { WorkItemCard } from "./work-item-card.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";

export type WorkItemColumnProps = {
  workItems: readonly WorkItem[];
  positioning: ItemPositioningApi;
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
        <span className="relations-view-column-count">{sorted.length}</span>
      </header>
      {sorted.length === 0 ? (
        <p className="relations-view-column-empty">No work items returned by the saved query.</p>
      ) : (
        <ol className="relations-view-work-item-list">
          {sorted.map((workItem) => (
            <li key={workItem.id} className="relations-view-work-item-list-item">
              <WorkItemCard workItem={workItem} positioning={props.positioning} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
