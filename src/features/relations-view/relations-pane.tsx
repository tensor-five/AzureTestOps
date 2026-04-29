import * as React from "react";

import type { ActiveSetSnapshot } from "../../domain/sets/set.js";
import type { RelationsViewMode } from "./mode.js";
import { TestCaseColumn } from "./test-case-column.js";
import { WorkItemColumn } from "./work-item-column.js";
import { useItemPositioning } from "./use-item-positioning.js";
import { useSuiteCollapse } from "./use-suite-collapse.js";

export type RelationsPaneProps = {
  setId: string | null;
  snapshot: ActiveSetSnapshot | null;
  mode: RelationsViewMode;
  isLoading: boolean;
  error: string | null;
  hasActiveSet: boolean;
};

export function RelationsPane(props: RelationsPaneProps): React.ReactElement {
  const positioning = useItemPositioning(props.setId, props.mode === "move-items");
  const collapse = useSuiteCollapse(props.setId);

  if (!props.hasActiveSet) {
    return (
      <RelationsPaneNotice title="Select or create a set">
        Open the set dropdown in the header and pick an active set, or use “Manage sets…” to
        configure your first one.
      </RelationsPaneNotice>
    );
  }

  if (props.error) {
    return (
      <RelationsPaneNotice title="Snapshot failed">
        <span>{props.error}</span>
        <span>Use the Refresh button to retry once the issue is resolved.</span>
      </RelationsPaneNotice>
    );
  }

  if (props.isLoading && !props.snapshot) {
    return (
      <RelationsPaneNotice title="Loading active set…">
        Test plans, suites, runs, results and the saved query are streaming in.
      </RelationsPaneNotice>
    );
  }

  if (!props.snapshot) {
    return (
      <RelationsPaneNotice title="No snapshot loaded">
        Click Refresh to load the active set.
      </RelationsPaneNotice>
    );
  }

  const { snapshot } = props;

  return (
    <section className="relations-view" data-mode={props.mode}>
      <TestCaseColumn
        suiteTree={snapshot.suiteTree}
        projections={snapshot.projections}
        positioning={positioning}
        collapse={collapse}
      />
      <WorkItemColumn workItems={snapshot.workItemsFromQuery} positioning={positioning} />
    </section>
  );
}

function RelationsPaneNotice(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ui-shell-placeholder">
      <h2>{props.title}</h2>
      <div className="relations-view-notice-body">{props.children}</div>
    </div>
  );
}
