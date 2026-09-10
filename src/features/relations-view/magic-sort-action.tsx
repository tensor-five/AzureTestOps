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
  isDebugOpen?: boolean;
  onDebugToggle?(): void;
  debugReport?: string | null;
  onCopyDebugReport?(): void;
  debugCopyStatus?: string;
};

/**
 * Presentation-only Magic Sort control. Its caller owns the optimization
 * state so the action can be composed into the application header.
 */
export function MagicSortAction(props: MagicSortActionProps): React.ReactElement {
  const [copyStatus, setCopyStatus] = React.useState("");
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
      {props.onDebugToggle ? <button type="button" className="ui-shell-magic-sort-debug" aria-label="Magic Sort Debug" onClick={props.onDebugToggle}><BugIcon /></button> : null}
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
        {props.status}{props.debugCopyStatus ?? copyStatus}
      </span>
      {props.isDebugOpen ? <section className="magic-sort-debug-report" data-magic-sort-debug-report>
        <header>Magic-Sort-Debug-Ausgabe <button type="button" aria-label="Copy Magic Sort debug report" disabled={!props.debugReport} onClick={() => {
          if (props.onCopyDebugReport) { props.onCopyDebugReport(); return; }
          void globalThis.navigator.clipboard?.writeText(props.debugReport ?? "").then(
            () => setCopyStatus("Bericht kopiert"), () => setCopyStatus("Kopieren fehlgeschlagen")
          );
        }}>Copy</button></header>
        <pre>{props.debugReport ?? "Noch kein Bericht"}</pre>
      </section> : null}
    </>
  );
}

function BugIcon(): React.ReactElement { return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 1h4v2a5 5 0 0 1 2 2h2v2h-2v2h2v2h-2a5 5 0 0 1-8 0H2V9h2V7H2V5h2a5 5 0 0 1 2-2V1Zm2 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /></svg>; }

function MagicWandIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 20 11-11 3 3L7 23H4v-3Z" />
      <path d="m15 4 .7 1.8L18 6.5l-2.3.7L15 9l-.7-1.8L12 6.5l2.3-.7L15 4Zm5 6 .45 1.05L22 11.5l-1.55.45L20 13l-.45-1.05L18 11.5l1.55-.45L20 10Z" />
    </svg>
  );
}
