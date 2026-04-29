import * as React from "react";

import { SetDropdown } from "../set-management/set-dropdown.js";
import { RefreshProgressBar } from "../relations-view/refresh-progress-bar.js";
import { modeLabel, type RelationsViewMode } from "../relations-view/mode.js";
import {
  iconForThemeMode,
  labelForThemeMode,
  type ThemeMode
} from "../../app/bootstrap/ui-client-theme.js";
import type { Set } from "../../domain/sets/set.js";
import type { SnapshotProgressEvent } from "../../application/use-cases/load-active-set-snapshot.use-case.js";

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
  sets: Set[];
  activeSetId: string | null;
  isSetsLoading: boolean;
  onSelectSet(setId: string): void;
  onManageSets(): void;
  mode: RelationsViewMode;
  onToggleMode(): void;
  onRefresh(): void;
  refreshDisabled: boolean;
  snapshotProgress: SnapshotProgressEvent | null;
  snapshotIsLoading: boolean;
  snapshotError: string | null;
};

/**
 * Top-of-shell header. Composes the AzureGanttOps look (preflight badge,
 * dropdowns, mode toggle, refresh, theme toggle) with no business logic — all
 * decisions are deferred to the orchestrator that owns state.
 */
export function AppHeader(props: AppHeaderProps): React.ReactElement {
  return (
    <section className="ui-shell-header">
      <div className="ui-shell-brand">
        <h1>Azure TestOps</h1>
      </div>
      <div className="ui-shell-header-actions">
        <PreflightBadge status={props.preflightStatus} />
        <SetDropdown
          sets={props.sets}
          activeSetId={props.activeSetId}
          isLoading={props.isSetsLoading}
          onSelect={props.onSelectSet}
          onManageSets={props.onManageSets}
        />
        <button
          type="button"
          className={`ui-shell-mode-toggle ui-shell-mode-toggle-${props.mode}`}
          onClick={props.onToggleMode}
          aria-pressed={props.mode === "edit-relations"}
        >
          <span aria-hidden="true">{props.mode === "edit-relations" ? "✎" : "↔"}</span>
          <span>{modeLabel(props.mode)}</span>
        </button>
        <button
          type="button"
          className="ui-shell-refresh-button"
          onClick={props.onRefresh}
          disabled={props.refreshDisabled}
          aria-label="Refresh active set"
        >
          <span aria-hidden="true">⟳</span>
          <span>Refresh</span>
        </button>
        <RefreshProgressBar
          progress={props.snapshotProgress}
          isLoading={props.snapshotIsLoading}
          error={props.snapshotError}
        />
        <button
          type="button"
          className="ui-shell-theme-toggle"
          aria-label={`Toggle theme (current: ${labelForThemeMode(props.themeMode)})`}
          title={`Theme: ${labelForThemeMode(props.themeMode)}`}
          onClick={props.onToggleTheme}
        >
          <span aria-hidden="true">{iconForThemeMode(props.themeMode)}</span>
          <span>{labelForThemeMode(props.themeMode)}</span>
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
    <span className={className} role="status" aria-live="polite" title={PREFLIGHT_LABELS[props.status]}>
      <span aria-hidden="true" className="ui-preflight-badge-dot" />
      <span>{PREFLIGHT_LABELS[props.status]}</span>
    </span>
  );
}
