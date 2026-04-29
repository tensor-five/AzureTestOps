import * as React from "react";

import type { ActiveSetSnapshot } from "../../domain/sets/set.js";
import type { RelationsViewMode } from "./mode.js";
import { modeLabel } from "./mode.js";

export type RelationsViewPlaceholderProps = {
  snapshot: ActiveSetSnapshot | null;
  mode: RelationsViewMode;
  isLoading: boolean;
  error: string | null;
  hasActiveSet: boolean;
};

/**
 * Phase 5 stand-in for the two-column relations editor. Confirms wiring
 * end-to-end (set → SSE → snapshot → render counts) without yet committing
 * to the Phase 6 layout. Replace with the real `relations-pane` once the
 * RelationsView feature lands.
 */
export function RelationsViewPlaceholder(
  props: RelationsViewPlaceholderProps
): React.ReactElement {
  if (!props.hasActiveSet) {
    return (
      <div className="ui-shell-placeholder">
        <h2>Select or create a set</h2>
        <p>
          Open the set dropdown in the header and pick an active set, or use “Manage sets…” to
          configure your first one.
        </p>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="ui-shell-placeholder">
        <h2>Snapshot failed</h2>
        <p>{props.error}</p>
        <p>Use the Refresh button to retry once the issue is resolved.</p>
      </div>
    );
  }

  if (props.isLoading && !props.snapshot) {
    return (
      <div className="ui-shell-placeholder">
        <h2>Loading active set…</h2>
        <p>Test plans, suites, runs, results and the saved query are streaming in.</p>
      </div>
    );
  }

  if (!props.snapshot) {
    return (
      <div className="ui-shell-placeholder">
        <h2>No snapshot loaded</h2>
        <p>Click Refresh to load the active set.</p>
      </div>
    );
  }

  const { snapshot } = props;

  return (
    <div className="ui-shell-placeholder">
      <h2>{snapshot.set.name}</h2>
      <p>
        Mode: <strong>{modeLabel(props.mode)}</strong>
      </p>
      <ul className="relations-view-summary">
        <li>{snapshot.projections.length} test-case projections</li>
        <li>{snapshot.workItemsFromQuery.length} work items from query</li>
        <li>Suite tree root: {snapshot.suiteTree.path}</li>
        <li>Loaded at {new Date(snapshot.loadedAt).toLocaleString()}</li>
      </ul>
      <p>
        [@TODO] Phase 6 lands the two-column layout, suite tree collapse and snap-to-grid item
        positioning. Phase 7 wires the Edit-mode line layer.
      </p>
    </div>
  );
}
