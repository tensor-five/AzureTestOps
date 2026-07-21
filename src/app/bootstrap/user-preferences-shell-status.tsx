import * as React from "react";

import type { UserPreferencesSyncStatus } from "../../shared/user-preferences/user-preferences.client.js";

const GITHUB_REPO_URL = "https://github.com/tensor-five/AzureTestOps";
const TENSORFIVE_WEBSITE_URL = "https://tensorfive.com";

export function HydratingAppShell(): React.ReactElement {
  return (
    <main
      data-ui-shell="phase-6-runtime"
      className="ui-shell"
      aria-busy="true"
    >
      <section className="ui-shell-header">
        <div className="ui-shell-brand-row">
          <div className="ui-shell-brand">
            <h1>AzureTestOps</h1>
          </div>
        </div>
        <div className="ui-shell-header-actions">
          <span
            className="ui-preflight-status-trigger ui-preflight-badge-checking"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" className="ui-preflight-badge-dot" />
            <span>Loading settings…</span>
          </span>
        </div>
      </section>
      <div className="ui-shell-content">
        <div className="ui-shell-placeholder">
          <h2>Loading settings…</h2>
          <div className="relations-view-notice-body">
            Local browser settings remain available if the local server cannot be reached.
          </div>
        </div>
      </div>
      <AppFooter />
    </main>
  );
}

export function PreferenceSyncError(props: {
  status: UserPreferencesSyncStatus;
}): React.ReactElement | null {
  const message = props.status.saveError ?? props.status.loadError;
  if (message === null) {
    return null;
  }

  return (
    <div
      className="relations-view-error-banner ui-shell-preference-error"
      role="alert"
      aria-live="assertive"
    >
      <span>{message}</span>
    </div>
  );
}

export function AppFooter(): React.ReactElement {
  return (
    <footer className="ui-shell-footer">
      <span>An </span>
      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
        Open Source Project
      </a>
      <span> by Christian Betz @ </span>
      <a href={TENSORFIVE_WEBSITE_URL} target="_blank" rel="noreferrer">
        TensorFive GmbH
      </a>
    </footer>
  );
}
