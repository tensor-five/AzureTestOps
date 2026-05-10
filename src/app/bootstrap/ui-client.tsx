import * as React from "react";
import { createRoot } from "react-dom/client";

import {
  applyThemeMode,
  nextThemeMode,
  persistThemeMode,
  readPersistedThemeMode,
  type ThemeMode
} from "./ui-client-theme.js";
import {
  getCachedUserPreferences,
  hydrateUserPreferences,
  persistUserPreferencesPatch
} from "../../shared/user-preferences/user-preferences.client.js";
import { AppHeader } from "../../features/navigation/header.js";
import { useAuthPreflight } from "../../features/navigation/use-auth-preflight.js";
import { useSetManagement } from "../../features/set-management/use-set-management.js";
import { SetDropdown } from "../../features/set-management/set-dropdown.js";
import { SetManagerDialog } from "../../features/set-management/set-manager-dialog.js";
import { useAdoContext } from "../../features/ado-context/use-ado-context.js";
import { useActiveSetSnapshot } from "../../features/relations-view/use-active-set-snapshot.js";
import { RefreshProgressBar } from "../../features/relations-view/refresh-progress-bar.js";
import { RelationsPane } from "../../features/relations-view/relations-pane.js";
import { ClientPortsProvider, useClientPorts } from "../composition/client-ports-context.js";
import { buildBrowserClientPorts } from "../composition/browser-runtime.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const GITHUB_REPO_URL = "https://github.com/tensor-five/AzureTestOps";
const TENSORFIVE_WEBSITE_URL = "https://tensorfive.com";

export type BootstrapUiClientOptions = {
  container: HTMLElement;
  /** Override the browser composition root — used by tests to inject mock ports. */
  ports?: ClientPorts;
};

export function bootstrapUiClient(options: BootstrapUiClientOptions): void {
  const ports = options.ports ?? buildBrowserClientPorts();
  const root = createRoot(options.container);
  root.render(
    <ClientPortsProvider ports={ports}>
      <AppShell />
    </ClientPortsProvider>
  );
}

function AppShell(): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() =>
    readPersistedThemeMode(THEME_MODE_STORAGE_KEY, getCachedUserPreferences().themeMode ?? null)
  );
  const [isSetManagerOpen, setSetManagerOpen] = React.useState(false);

  React.useEffect(() => {
    void hydrateUserPreferences().then((preferences) => {
      if (preferences.themeMode) {
        setThemeMode(preferences.themeMode);
      }
    });
  }, []);

  React.useEffect(() => {
    applyThemeMode(themeMode);
    persistThemeMode(THEME_MODE_STORAGE_KEY, themeMode);
    persistUserPreferencesPatch({ themeMode });
  }, [themeMode]);

  const preflightStatus = useAuthPreflight();
  const setManagement = useSetManagement();
  const adoContextState = useAdoContext();
  const ports = useClientPorts();
  const { state: snapshotState, refresh: refreshSnapshot } = useActiveSetSnapshot(
    setManagement.activeSetId
  );

  const handleThemeToggle = React.useCallback(() => {
    setThemeMode((current) => nextThemeMode(current));
  }, []);

  const handleSelectSet = React.useCallback(
    (setId: string) => {
      void setManagement.setActive(setId);
    },
    [setManagement]
  );

  const getWorkItemHref = React.useMemo<((workItemId: number) => string | null) | undefined>(() => {
    const context = adoContextState.context;
    return context
      ? (workItemId: number) => ports.workItemDeepLink.buildHref(context, workItemId)
      : undefined;
  }, [adoContextState.context, ports.workItemDeepLink]);

  return (
    <main data-ui-shell="phase-6-runtime" className="ui-shell">
      <AppHeader
        preflightStatus={preflightStatus}
        themeMode={themeMode}
        onToggleTheme={handleThemeToggle}
        setSwitcher={
          <SetDropdown
            sets={setManagement.sets}
            activeSetId={setManagement.activeSetId}
            isLoading={setManagement.isLoading}
            onSelect={handleSelectSet}
            onManageSets={() => setSetManagerOpen(true)}
          />
        }
        refreshControl={
          <>
            <button
              type="button"
              className="ui-shell-refresh-button"
              onClick={refreshSnapshot}
              disabled={!setManagement.activeSetId || snapshotState.isLoading}
              aria-label="Refresh active set"
            >
              <span aria-hidden="true">⟳</span>
              <span>Refresh</span>
            </button>
            <RefreshProgressBar
              progress={snapshotState.progress}
              isLoading={snapshotState.isLoading}
              error={snapshotState.error}
            />
          </>
        }
      />
      <div className="ui-shell-content">
        <RelationsPane
          setId={setManagement.activeSetId}
          snapshot={snapshotState.snapshot}
          isLoading={snapshotState.isLoading}
          error={snapshotState.error}
          hasActiveSet={Boolean(setManagement.activeSetId)}
          getWorkItemHref={getWorkItemHref}
        />
      </div>
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

      <SetManagerDialog
        isOpen={isSetManagerOpen}
        sets={setManagement.sets}
        activeSetId={setManagement.activeSetId}
        adoContext={adoContextState}
        onClose={() => setSetManagerOpen(false)}
        onCreate={setManagement.create}
        onUpdate={setManagement.update}
        onDelete={setManagement.remove}
        onSetActive={setManagement.setActive}
      />
    </main>
  );
}
