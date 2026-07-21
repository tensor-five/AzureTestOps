// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "./header.js";

describe("AppHeader", () => {
  it("keeps global controls compact and exposes detailed auth status", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onToggleTheme = vi.fn();
    act(() => root.render(
      <AppHeader
        preflightStatus="READY"
        themeMode="light"
        onToggleTheme={onToggleTheme}
        setSwitcher={<button type="button">Sprint set</button>}
      />
    ));

    expect(host.querySelector("h1")?.textContent).toBe("AzureTestOps");
    expect(host.querySelector("summary")?.textContent).toContain("Status");
    const liveStatus = host.querySelector<HTMLElement>('[role="status"]')!;
    expect(liveStatus.textContent).toBe("Azure CLI ready");
    expect(host.querySelector("details")?.contains(liveStatus)).toBe(false);

    act(() => root.render(
      <AppHeader
        preflightStatus="SESSION_EXPIRED"
        themeMode="light"
        onToggleTheme={onToggleTheme}
        setSwitcher={<button type="button">Sprint set</button>}
      />
    ));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Run az login");
    const theme = host.querySelector<HTMLButtonElement>('button[aria-label^="Toggle theme"]')!;
    act(() => theme.click());
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    host.remove();
  });
});
