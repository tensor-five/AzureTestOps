import * as React from "react";

import type { MagicSortFeedbackState } from "./use-magic-sort.js";

export type MagicSortActionProps = {
  onStart(): void;
  isRunning: boolean;
  status: string;
  progress?: number;
  feedbackState?: MagicSortFeedbackState;
  addSpacer?: boolean;
  onAddSpacerChange?(next: boolean): void;
};

/**
 * Presentation-only Magic Sort control. Its caller owns the optimization
 * state so the action can be composed into the application header.
 */
export function MagicSortAction(props: MagicSortActionProps): React.ReactElement {
  const progress = Math.max(0, Math.min(100, props.progress ?? 0));
  const feedbackState = props.feedbackState ?? "idle";
  const showsProgress = feedbackState === "running" || feedbackState === "complete";
  return (
    <>
      {props.onAddSpacerChange ? (
        <label className="ui-shell-magic-sort-spacer-option">
          <input
            type="checkbox"
            checked={props.addSpacer ?? false}
            onChange={(event) => props.onAddSpacerChange?.(event.target.checked)}
            disabled={props.isRunning}
          />
          <span>Add Spacer</span>
        </label>
      ) : null}
      <button
        type="button"
        className={[
          "ui-shell-magic-sort",
          feedbackState === "running" ? "is-magic-running" : "",
          feedbackState === "complete" ? "is-magic-complete" : "",
          feedbackState === "confirmed" ? "is-magic-confirmed" : ""
        ].filter(Boolean).join(" ")}
        aria-label="Magic Sort"
        onClick={props.onStart}
        disabled={props.isRunning}
      >
        <MagicWandIcon />
        <span className="ui-shell-magic-sort-label">Magic Sort</span>
        {showsProgress ? (
          <span
            className="ui-shell-magic-sort-progress"
            role="progressbar"
            aria-label="Magic Sort optimization progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className="ui-shell-magic-sort-progress-bar" style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </button>
      <span className="u-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {props.status}
      </span>
    </>
  );
}

function MagicWandIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 20 11-11 3 3L7 23H4v-3Z" />
      <path d="m15 4 .7 1.8L18 6.5l-2.3.7L15 9l-.7-1.8L12 6.5l2.3-.7L15 4Zm5 6 .45 1.05L22 11.5l-1.55.45L20 13l-.45-1.05L18 11.5l1.55-.45L20 10Z" />
    </svg>
  );
}
