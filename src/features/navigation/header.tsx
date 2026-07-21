import * as React from "react";

import {
  iconForThemeMode,
  labelForThemeMode,
  type ThemeMode
} from "../../app/bootstrap/ui-client-theme.js";

export type PreflightStatus =
  | "READY"
  | "CLI_NOT_FOUND"
  | "MISSING_EXTENSION"
  | "SESSION_EXPIRED"
  | "CONTEXT_MISMATCH"
  | "UNKNOWN_ERROR"
  | "CHECKING";

export const PREFLIGHT_LABELS: Record<PreflightStatus, string> = {
  READY: "Azure CLI ready",
  CLI_NOT_FOUND: "Install Azure CLI",
  MISSING_EXTENSION: "Install azure-devops extension",
  SESSION_EXPIRED: "Run az login",
  CONTEXT_MISMATCH: "ADO context mismatch — re-run setup",
  UNKNOWN_ERROR: "Auth check failed",
  CHECKING: "Checking auth…"
};

export type AppHeaderProps = {
  preflightStatus: PreflightStatus;
  themeMode: ThemeMode;
  onToggleTheme(): void;
  setSwitcher: React.ReactNode;
};

/**
 * Top-of-shell header. Composes the AzureGanttOps look (set picker,
 * compact status, theme toggle) with no business logic — all
 * decisions are deferred to the orchestrator that owns state.
 */
export function AppHeader(props: AppHeaderProps): React.ReactElement {
  return (
    <section className="ui-shell-header">
      <div className="ui-shell-brand-row">
        <div className="ui-shell-brand">
          <h1>AzureTestOps</h1>
        </div>
      </div>
      <div className="ui-shell-header-actions">
        <div className="ui-shell-set-picker">
          <span className="ui-shell-set-picker-label">Set</span>
          {props.setSwitcher}
        </div>
        <PreflightBadge status={props.preflightStatus} />
        <button
          type="button"
          className="ui-shell-theme-toggle"
          aria-label={`Toggle theme (current: ${labelForThemeMode(props.themeMode)})`}
          title={`Theme: ${labelForThemeMode(props.themeMode)}`}
          onClick={props.onToggleTheme}
        >
          <span aria-hidden="true">{iconForThemeMode(props.themeMode)}</span>
          <span className="u-visually-hidden">{labelForThemeMode(props.themeMode)}</span>
        </button>
      </div>
    </section>
  );
}

function PreflightBadge(props: { status: PreflightStatus }): React.ReactElement {
  const isReady = props.status === "READY";
  const isChecking = props.status === "CHECKING";
  const className =
    "ui-preflight-badge " +
    (isReady
      ? "ui-preflight-badge-ready"
      : isChecking
        ? "ui-preflight-badge-checking"
        : "ui-preflight-badge-warn");

  return (
    <>
      <span
        className="u-visually-hidden ui-preflight-live-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {PREFLIGHT_LABELS[props.status]}
      </span>
      <details className={`ui-preflight-status ${className}`}>
        <summary className="ui-preflight-status-trigger" title={PREFLIGHT_LABELS[props.status]}>
          <span aria-hidden="true" className="ui-preflight-badge-dot" />
          <span>{isReady ? "Status" : isChecking ? "Checking" : "Action needed"}</span>
        </summary>
        <div className="ui-preflight-status-panel">
          <strong>Azure DevOps access</strong>
          <span>{PREFLIGHT_LABELS[props.status]}</span>
        </div>
      </details>
    </>
  );
}
