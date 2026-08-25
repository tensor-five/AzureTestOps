// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader, type AppHeaderProps } from "../navigation/header.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const navigationCss = await readFile(
  path.resolve("src/app/bootstrap/local-ui-navigation.css"),
  "utf8"
);

type HeaderHarness = {
  host: HTMLDivElement;
  root: Root;
  renderToolbar(props: Partial<MagicSortActionProps>): void;
  unmount(): void;
};

beforeEach(() => {
  const style = document.createElement("style");
  style.dataset.testNavigationCss = "";
  style.textContent = navigationCss;
  document.head.append(style);
});

afterEach(() => {
  document.querySelectorAll("style[data-test-navigation-css]").forEach((element) => element.remove());
  vi.restoreAllMocks();
});

describe("Magic Sort header placement contract v1", () => {
  it("MSH-01 places the keyboard-operable Magic Sort action with its wand in the global header", async () => {
    const onMagicSort = vi.fn();
    const harness = renderHeaderWithToolbar({ onMagicSort });

    const magicSort = harness.host.querySelector<HTMLButtonElement>(
      '.ui-shell-header button[aria-label="Magic Sort"]'
    );
    expect(magicSort).not.toBeNull();
    expect(magicSort?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    magicSort?.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onMagicSort).toHaveBeenCalledOnce();

    harness.unmount();
  });

  it("MSH-02 keeps the global header sticky while the workspace content scrolls", () => {
    const harness = renderHeaderWithToolbar();
    const header = harness.host.querySelector<HTMLElement>(".ui-shell-header");

    expect(header).not.toBeNull();
    expect(getComputedStyle(header!).position).toBe("sticky");
    expect(harness.host.querySelector('[data-magic-sort-slot] button[aria-label="Magic Sort"]'))
      .not.toBeNull();

    harness.unmount();
  });

  it("MSH-03 keeps the action status and disabled state in the header during optimization", () => {
    const harness = renderHeaderWithToolbar({ isMagicSorting: true, magicSortStatus: "Magic Sort is optimizing the layout." });
    const magicSort = harness.host.querySelector<HTMLButtonElement>(
      '.ui-shell-header button[aria-label="Magic Sort"]'
    );

    expect(magicSort?.disabled).toBe(true);
    expect(harness.host.querySelector('.ui-shell-header [role="status"]')?.textContent)
      .toContain("Magic Sort is optimizing the layout.");

    harness.unmount();
  });

  it("MSH-04 retains the accessible action name independently of its visible label", () => {
    const harness = renderHeaderWithToolbar();
    const magicSort = harness.host.querySelector<HTMLButtonElement>(
      '.ui-shell-header button[aria-label="Magic Sort"]'
    );

    expect(magicSort?.getAttribute("aria-label")).toBe("Magic Sort");
    expect(magicSort?.querySelector(".ui-shell-magic-sort-label")).not.toBeNull();
    expect(navigationCss).toMatch(
      /@media\s*\([^)]*max-width[^)]*\)[\s\S]*?\.ui-shell-magic-sort-label\s*\{[^}]*display:\s*none/s
    );

    harness.unmount();
  });
});

function renderHeaderWithToolbar(overrides: Partial<MagicSortActionProps> = {}): HeaderHarness {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const renderToolbar = (nextOverrides: Partial<MagicSortActionProps>) => {
    act(() => root.render(<HeaderAndToolbar magicSort={magicSortActionProps(nextOverrides)} />));
  };
  renderToolbar(overrides);
  return {
    host,
    root,
    renderToolbar,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  };
}

type HeaderWithMagicSortProps = AppHeaderProps & { magicSortAction?: React.ReactNode };
const HeaderWithMagicSort = AppHeader as React.ComponentType<HeaderWithMagicSortProps>;

type MagicSortActionProps = {
  onMagicSort(): void;
  isMagicSorting: boolean;
  magicSortStatus: string;
};

function HeaderAndToolbar(props: { magicSort: MagicSortActionProps }): React.ReactElement {
  return (
    <HeaderWithMagicSort
      preflightStatus="READY"
      themeMode="system"
      onToggleTheme={() => undefined}
      setSwitcher={<button type="button">Release 2.0</button>}
      magicSortAction={<MagicSortAction {...props.magicSort} />}
    />
  );
}

function MagicSortAction(props: MagicSortActionProps): React.ReactElement {
  return <><button type="button" aria-label="Magic Sort" onClick={props.onMagicSort} disabled={props.isMagicSorting}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 11-11 3 3L7 23H4v-3Z" /></svg>
    <span className="ui-shell-magic-sort-label">Magic Sort</span>
  </button><span className="u-visually-hidden" role="status" aria-live="polite">{props.magicSortStatus}</span></>;
}

function magicSortActionProps(overrides: Partial<MagicSortActionProps>): MagicSortActionProps {
  return {
    onMagicSort: () => undefined,
    isMagicSorting: false,
    magicSortStatus: "",
    ...overrides
  };
}
