// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { RelationsPane } from "./relations-pane.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import type { ActiveSetSnapshot } from "../../domain/sets/set.js";

function makeSnapshot(): ActiveSetSnapshot {
  return {
    set: {
      id: "set-1",
      name: "Sprint 24",
      planId: "9",
      rootSuiteId: "1",
      queryId: "Q-A"
    },
    suiteTree: {
      id: 1,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: []
    },
    projections: [
      {
        workItemId: 101,
        suiteId: 1,
        suitePath: "Root",
        title: "Login flow",
        state: "Design",
        workItemType: "Test Case",
        assignedTo: null,
        tags: [],
        areaPath: null,
        priority: null,
        relatedIds: [],
        testPointId: null,
        configurationId: null,
        configurationName: null,
        lastOutcome: "Passed",
        lastResultId: 999,
        lastResultCompletedDate: "2026-04-29T10:00:00.000Z",
        lastRunId: 42
      }
    ],
    workItemsFromQuery: [
      {
        id: 501,
        workItemType: "Bug",
        title: "Login redirect loops on stale session",
        state: "Active",
        assignedTo: "alice",
        tags: ["regression"],
        areaPath: "Project\\Auth",
        priority: 2,
        relatedIds: [101]
      }
    ],
    loadedAt: "2026-04-29T10:00:00.000Z"
  };
}

function render(ui: React.ReactElement): { container: HTMLDivElement; unmount(): void } {
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.restoreAllMocks();
    }
  };
}

describe("RelationsPane", () => {
  it("shows a 'select set' notice when no active set is configured", () => {
    const harness = render(
      <RelationsPane
        setId={null}
        snapshot={null}
        mode="move-items"
        isLoading={false}
        error={null}
        hasActiveSet={false}
      />
    );

    expect(harness.container.querySelector(".ui-shell-placeholder h2")?.textContent).toBe(
      "Select or create a set"
    );

    harness.unmount();
  });

  it("renders both columns from a snapshot", () => {
    const harness = render(
      <RelationsPane
        setId="set-1"
        snapshot={makeSnapshot()}
        mode="move-items"
        isLoading={false}
        error={null}
        hasActiveSet={true}
      />
    );

    expect(harness.container.querySelector('.relations-view[data-mode="move-items"]')).not.toBeNull();
    expect(harness.container.querySelectorAll(".relations-view-column").length).toBe(2);
    expect(harness.container.querySelectorAll(".relations-view-card").length).toBe(2);

    harness.unmount();
  });

  it("falls back to a loading notice while waiting for the first snapshot", () => {
    const harness = render(
      <RelationsPane
        setId="set-1"
        snapshot={null}
        mode="move-items"
        isLoading={true}
        error={null}
        hasActiveSet={true}
      />
    );

    expect(harness.container.querySelector(".ui-shell-placeholder h2")?.textContent).toBe(
      "Loading active set…"
    );

    harness.unmount();
  });

  it("surfaces snapshot errors", () => {
    const harness = render(
      <RelationsPane
        setId="set-1"
        snapshot={null}
        mode="move-items"
        isLoading={false}
        error="Set ghost not found."
        hasActiveSet={true}
      />
    );

    expect(harness.container.querySelector(".ui-shell-placeholder h2")?.textContent).toBe(
      "Snapshot failed"
    );
    expect(harness.container.querySelector(".relations-view-notice-body")?.textContent).toContain(
      "Set ghost not found."
    );

    harness.unmount();
  });
});
