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

const THEME_MODE_STORAGE_KEY = "azure-testops.theme-mode.v1";
const TENSORFIVE_WEBSITE_URL = "https://tensorfive.com";

export type BootstrapUiClientOptions = {
  container: HTMLElement;
};

export function bootstrapUiClient(options: BootstrapUiClientOptions): void {
  const root = createRoot(options.container);
  root.render(React.createElement(AppShell));
}

function AppShell(): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() =>
    readPersistedThemeMode(THEME_MODE_STORAGE_KEY, null)
  );

  React.useEffect(() => {
    applyThemeMode(themeMode);
    persistThemeMode(THEME_MODE_STORAGE_KEY, themeMode);
  }, [themeMode]);

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
