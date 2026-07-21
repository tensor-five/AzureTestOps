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
  installUserPreferencesPort,
  persistUserPreferencesPatch,
  type UserPreferencesSyncStatus
} from "../../shared/user-preferences/user-preferences.client.js";
import type { UserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";
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
import { resolveSetAdoContext } from "./resolve-set-ado-context.js";
import { useUserPreferencesBootstrap } from "./use-user-preferences-bootstrap.js";
import {
  AppFooter,
  HydratingAppShell,
  PreferenceSyncError
} from "./user-preferences-shell-status.js";

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";

export type BootstrapUiClientOptions = {
  container: HTMLElement;
  /** Override the browser composition root — used by tests to inject mock ports. */
  ports?: ClientPorts;
};

export function bootstrapUiClient(options: BootstrapUiClientOptions): void {
  const ports = options.ports ?? buildBrowserClientPorts();
  installUserPreferencesPort(ports.userPreferences);
  const root = createRoot(options.container);
  root.render(
    <ClientPortsProvider ports={ports}>
      <AppShell />
    </ClientPortsProvider>
  );
}

export function AppShell(): React.ReactElement {
  const preferencesBootstrap = useUserPreferencesBootstrap();

  if (preferencesBootstrap.preferences === null) {
    return <HydratingAppShell />;
  }

  return (
    <HydratedAppShell
      preferences={preferencesBootstrap.preferences}
      preferenceSyncStatus={preferencesBootstrap.syncStatus}
    />
  );
}

function HydratedAppShell(props: {
  preferences: UserPreferences;
  preferenceSyncStatus: UserPreferencesSyncStatus;
}): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() =>
    readPersistedThemeMode(
      THEME_MODE_STORAGE_KEY,
      props.preferences.themeMode ?? null,
      props.preferenceSyncStatus.loadError !== null
    )
  );
  const [isSetManagerOpen, setSetManagerOpen] = React.useState(false);

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

  const getSuiteHref = React.useMemo<((suiteId: number) => string | null) | undefined>(() => {
    const set = snapshotState.snapshot?.set;
    const context = resolveSetAdoContext(set, adoContextState.context);
    return set && context
      ? (suiteId: number) => ports.testSuiteDeepLink.buildHref(context, set.planId, suiteId)
      : undefined;
  }, [adoContextState.context, ports.testSuiteDeepLink, snapshotState.snapshot?.set]);

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
      />
      <PreferenceSyncError status={props.preferenceSyncStatus} />
      <div className="ui-shell-content">
        <RelationsPane
          setId={setManagement.activeSetId}
          snapshot={snapshotState.snapshot}
          isLoading={snapshotState.isLoading}
          error={snapshotState.error}
          hasActiveSet={Boolean(setManagement.activeSetId)}
          getWorkItemHref={getWorkItemHref}
          getSuiteHref={getSuiteHref}
          refreshControl={
            <div className="relations-workspace-refresh">
              <button
                type="button"
                className="relations-workspace-refresh-button"
                onClick={refreshSnapshot}
                disabled={!setManagement.activeSetId || snapshotState.isLoading}
                aria-label="Refresh active set"
              >
                <span aria-hidden="true">↻</span>
                <span>Refresh</span>
              </button>
              <RefreshProgressBar
                progress={snapshotState.progress}
                isLoading={snapshotState.isLoading}
                error={snapshotState.error}
              />
            </div>
          }
        />
      </div>
      <AppFooter />

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
