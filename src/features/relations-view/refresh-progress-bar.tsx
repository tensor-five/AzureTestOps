import * as React from "react";

import type { SnapshotProgressEvent } from "../../application/use-cases/load-active-set-snapshot.use-case.js";

export type RefreshProgressBarProps = {
  progress: SnapshotProgressEvent | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * Compact progress bar shown next to the Refresh button. Renders nothing when
 * the snapshot is idle and not in error — the goal is invisible UI when there
 * is nothing meaningful to communicate.
 */
export function RefreshProgressBar(props: RefreshProgressBarProps): React.ReactElement | null {
  const { progress, isLoading, error } = props;

  if (error) {
    return (
      <div className="refresh-progress refresh-progress-error" role="alert">
        {error}
      </div>
    );
  }

  if (!isLoading && !progress) {
    return null;
  }

  const percent = progress
    ? Math.max(0, Math.min(100, Math.round((progress.done / Math.max(1, progress.total)) * 100)))
    : 0;
  const label = progress ? labelFor(progress) : "Loading…";

  return (
    <div className="refresh-progress" role="status" aria-live="polite">
      <span className="refresh-progress-label">{label}</span>
      <span className="refresh-progress-track" aria-hidden="true">
        <span className="refresh-progress-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

function labelFor(progress: SnapshotProgressEvent): string {
  switch (progress.stage) {
    case "context":
      return progress.message ? `Set: ${progress.message}` : "Resolving set…";
    case "test-cases":
      return progress.message ?? "Loading test cases…";
    case "saved-query":
      return progress.message ?? "Running saved query…";
    case "aggregate":
      return "Aggregating outcomes…";
    case "done":
      return "Done";
    default:
      return progress.stage;
  }
}
