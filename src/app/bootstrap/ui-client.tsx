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
import {
  AppHeader,
  type PreflightStatus
} from "../../features/navigation/header.js";
import { useSetManagement } from "../../features/set-management/use-set-management.js";
import { SetManagerDialog } from "../../features/set-management/set-manager-dialog.js";
import { useActiveSetSnapshot } from "../../features/relations-view/use-active-set-snapshot.js";
import { RelationsViewPlaceholder } from "../../features/relations-view/relations-view-placeholder.js";
import {
  DEFAULT_MODE,
  nextMode,
  type RelationsViewMode
} from "../../features/relations-view/mode.js";

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const TENSORFIVE_WEBSITE_URL = "https://tensorfive.com";

export type BootstrapUiClientOptions = {
  container: HTMLElement;
};

export function bootstrapUiClient(options: BootstrapUiClientOptions): void {
  const root = createRoot(options.container);
  root.render(<AppShell />);
}

function AppShell(): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() =>
    readPersistedThemeMode(THEME_MODE_STORAGE_KEY, getCachedUserPreferences().themeMode ?? null)
  );
  const [preflightStatus, setPreflightStatus] = React.useState<PreflightStatus>("CHECKING");
  const [isSetManagerOpen, setSetManagerOpen] = React.useState(false);
  const [mode, setMode] = React.useState<RelationsViewMode>(DEFAULT_MODE);

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

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/phase2/auth-preflight", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          return { result: { status: "UNKNOWN_ERROR" as PreflightStatus } };
        }
        return (await response.json()) as { result: { status: PreflightStatus } };
      })
      .then((payload) => {
        if (cancelled) return;
        setPreflightStatus(payload.result?.status ?? "UNKNOWN_ERROR");
      })
      .catch(() => {
        if (cancelled) return;
        setPreflightStatus("UNKNOWN_ERROR");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        mode={mode}
        onToggleMode={() => setMode((current) => nextMode(current))}
        onRefresh={refreshSnapshot}
        refreshDisabled={!setManagement.activeSetId || snapshotState.isLoading}
        snapshotProgress={snapshotState.progress}
        snapshotIsLoading={snapshotState.isLoading}
        snapshotError={snapshotState.error}
      />
      <div className="ui-shell-content">
        <RelationsViewPlaceholder
          snapshot={snapshotState.snapshot}
          mode={mode}
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
