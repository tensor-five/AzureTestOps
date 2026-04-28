import * as React from "react";
import { createRoot } from "react-dom/client";

import {
  applyThemeMode,
  iconForThemeMode,
  labelForThemeMode,
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

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const TENSORFIVE_WEBSITE_URL = "https://tensorfive.com";

const PREFLIGHT_LABELS: Record<PreflightStatus, string> = {
  READY: "Azure CLI ready",
  CLI_NOT_FOUND: "Install Azure CLI",
  MISSING_EXTENSION: "Install azure-devops extension",
  SESSION_EXPIRED: "Run az login",
  CONTEXT_MISMATCH: "Set ADO defaults",
  UNKNOWN_ERROR: "Auth check failed",
  CHECKING: "Checking auth…"
};

type PreflightStatus =
  | "READY"
  | "CLI_NOT_FOUND"
  | "MISSING_EXTENSION"
  | "SESSION_EXPIRED"
  | "CONTEXT_MISMATCH"
  | "UNKNOWN_ERROR"
  | "CHECKING";

export type BootstrapUiClientOptions = {
  container: HTMLElement;
};

export function bootstrapUiClient(options: BootstrapUiClientOptions): void {
  const root = createRoot(options.container);
  root.render(React.createElement(AppShell));
}

function AppShell(): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() =>
    readPersistedThemeMode(THEME_MODE_STORAGE_KEY, getCachedUserPreferences().themeMode ?? null)
  );
  const [preflightStatus, setPreflightStatus] = React.useState<PreflightStatus>("CHECKING");

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

  const handleThemeToggle = React.useCallback(() => {
    setThemeMode((current) => nextThemeMode(current));
  }, []);

  return React.createElement(
    "main",
    { "data-ui-shell": "phase-6-runtime", className: "ui-shell" },
    React.createElement(
      "section",
      { className: "ui-shell-header" },
      React.createElement(
        "div",
        { className: "ui-shell-brand" },
        React.createElement("h1", null, "Azure TestOps")
      ),
      React.createElement(
        "div",
        { className: "ui-shell-header-actions" },
        renderPreflightBadge(preflightStatus),
        React.createElement(
          "button",
          {
            type: "button",
            className: "ui-shell-theme-toggle",
            "aria-label": `Toggle theme (current: ${labelForThemeMode(themeMode)})`,
            title: `Theme: ${labelForThemeMode(themeMode)}`,
            onClick: handleThemeToggle
          },
          React.createElement("span", { "aria-hidden": "true" }, iconForThemeMode(themeMode)),
          React.createElement("span", null, labelForThemeMode(themeMode))
        )
      )
    ),
    React.createElement(
      "div",
      { className: "ui-shell-content" },
      React.createElement(
        "div",
        { className: "ui-shell-placeholder" },
        React.createElement("h2", null, "Test Cases ↔ Bugs Relations"),
        React.createElement(
          "p",
          null,
          "[@TODO] Set selection, two-column layout and relation editing land in the next phases."
        )
      )
    ),
    React.createElement(
      "footer",
      { className: "ui-shell-footer" },
      React.createElement("span", null, "Azure TestOps · "),
      React.createElement(
        "a",
        { href: TENSORFIVE_WEBSITE_URL, target: "_blank", rel: "noreferrer" },
        "TensorFive GmbH"
      )
    )
  );
}

function renderPreflightBadge(status: PreflightStatus): React.ReactElement {
  const isReady = status === "READY";
  const isChecking = status === "CHECKING";
  const className =
    "ui-preflight-badge " +
    (isReady
      ? "ui-preflight-badge-ready"
      : isChecking
        ? "ui-preflight-badge-checking"
        : "ui-preflight-badge-warn");

  return React.createElement(
    "span",
    {
      className,
      role: "status",
      "aria-live": "polite",
      title: PREFLIGHT_LABELS[status]
    },
    React.createElement("span", { "aria-hidden": "true", className: "ui-preflight-badge-dot" }),
    React.createElement("span", null, PREFLIGHT_LABELS[status])
  );
}
