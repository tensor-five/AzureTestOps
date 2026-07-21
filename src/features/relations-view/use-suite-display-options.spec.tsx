// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { useSuiteDisplayOptions } from "./use-suite-display-options.js";

describe("useSuiteDisplayOptions", () => {
  beforeEach(() => {
    clearSetLayoutPreferenceForTests();
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
    vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
  });

  afterEach(() => vi.restoreAllMocks());

  it("persists hide-empty while preserving the remaining layout", () => {
    vi.mocked(preferencesClient.getCachedUserPreferences).mockReturnValue({
      setLayouts: { "set-1": { collapsedSuites: ["3"] } }
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const result = { current: null as ReturnType<typeof useSuiteDisplayOptions> | null };

    function Capture(): null {
      result.current = useSuiteDisplayOptions("set-1");
      return null;
    }

    act(() => root.render(<Capture />));
    act(() => result.current?.setHideEmptySuites(true));

    expect(preferencesClient.persistUserPreferencesPatch).toHaveBeenCalledWith({
      setLayouts: {
        "set-1": { collapsedSuites: ["3"], hideEmptySuites: true }
      }
    });

    act(() => root.unmount());
    host.remove();
  });
});
