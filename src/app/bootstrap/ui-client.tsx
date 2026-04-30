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
import { SetManagerDialog } from "../../features/set-management/set-manager-dialog.js";
import { useActiveSetSnapshot } from "../../features/relations-view/use-active-set-snapshot.js";
import { RelationsPane } from "../../features/relations-view/relations-pane.js";
import { ClientPortsProvider } from "../composition/client-ports-context.js";
import { buildBrowserClientPorts } from "../composition/browser-runtime.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
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

  return (
    <main data-ui-shell="phase-6-runtime" className="ui-shell">
      <AppHeader
        preflightStatus={preflightStatus}
        themeMode={themeMode}
        onToggleTheme={handleThemeToggle}
        sets={setManagement.sets}
        activeSetId={setManagement.activeSetId}
        isSetsLoading={setManagement.isLoading}
        onSelectSet={handleSelectSet}
        onManageSets={() => setSetManagerOpen(true)}
        onRefresh={refreshSnapshot}
        refreshDisabled={!setManagement.activeSetId || snapshotState.isLoading}
        snapshotProgress={snapshotState.progress}
        snapshotIsLoading={snapshotState.isLoading}
        snapshotError={snapshotState.error}
      />
      <div className="ui-shell-content">
        <RelationsPane
          setId={setManagement.activeSetId}
          snapshot={snapshotState.snapshot}
          isLoading={snapshotState.isLoading}
          error={snapshotState.error}
          hasActiveSet={Boolean(setManagement.activeSetId)}
        />
      </div>
      <footer className="ui-shell-footer">
        <span>Azure TestOps · </span>
        <a href={TENSORFIVE_WEBSITE_URL} target="_blank" rel="noreferrer">
          TensorFive GmbH
        </a>
      </footer>

      <SetManagerDialog
        isOpen={isSetManagerOpen}
        sets={setManagement.sets}
        activeSetId={setManagement.activeSetId}
        onClose={() => setSetManagerOpen(false)}
        onCreate={setManagement.create}
        onUpdate={setManagement.update}
        onDelete={setManagement.remove}
        onSetActive={setManagement.setActive}
      />
    </main>
  );
}
