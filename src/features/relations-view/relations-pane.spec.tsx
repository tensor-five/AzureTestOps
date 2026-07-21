// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { RelationsPane } from "./relations-pane.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";

const refreshControl = <button type="button">Refresh</button>;

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

function makeNestedSnapshot(): ActiveSetSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    suiteTree: {
      ...snapshot.suiteTree,
      children: [{
        id: 2,
        name: "Child",
        parentSuiteId: 1,
        path: "Root > Child",
        children: []
      }]
    },
    projections: snapshot.projections.map((projection) => ({
      ...projection,
      suiteId: 2,
      suitePath: "Root > Child"
    }))
  };
}

function render(ui: React.ReactElement): {
  container: HTMLDivElement;
  rerender(next: React.ReactElement): void;
  unmount(): void;
} {
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();

  const ports = buildClientPortsStub({
    adoContext: {
      getContext: async () => null,
      setContext: async (ctx) => ctx,
      getCliDefaults: async () => ({ organization: "", project: "" })
    },
    relationMutations: {
      add: async () => undefined,
      remove: async () => undefined
    }
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<WithClientPorts ports={ports}>{ui}</WithClientPorts>);
  });
  return {
    container,
    rerender: (next) => {
      act(() => {
        root.render(<WithClientPorts ports={ports}>{next}</WithClientPorts>);
      });
    },
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
        isLoading={false}
        error={null}
        hasActiveSet={false}
        refreshControl={refreshControl}
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
        isLoading={false}
        error={null}
        hasActiveSet={true}
        refreshControl={refreshControl}
      />
    );

    expect(harness.container.querySelector(".relations-view")).not.toBeNull();
    expect(harness.container.querySelectorAll(".relations-view-column").length).toBe(2);
    expect(harness.container.querySelectorAll(".relations-view-card").length).toBe(2);
    expect(harness.container.querySelector(".relations-workspace-summary")?.textContent)
      .toContain("1 relations");

    harness.unmount();
  });

  it("applies relation quick filters and suite focus without changing snapshot data", () => {
    const harness = render(
      <RelationsPane
        setId="set-1"
        snapshot={makeSnapshot()}
        isLoading={false}
        error={null}
        hasActiveSet={true}
        refreshControl={refreshControl}
      />
    );

    const testCaseColumn = harness.container.querySelector<HTMLElement>(
      ".relations-view-column-test-cases"
    )!;
    act(() => testCaseColumn.querySelector<HTMLButtonElement>(".filter-bar-toggle")?.click());
    const unlinkedButton = [...testCaseColumn.querySelectorAll<HTMLButtonElement>(
      ".filter-bar-quick-action"
    )].find((button) => button.textContent === "Only unlinked")!;
    act(() => unlinkedButton.click());
    expect(testCaseColumn.querySelector(".relations-view-card-test-case")).toBeNull();

    act(() => unlinkedButton.click());
    const focusButton = testCaseColumn.querySelector<HTMLButtonElement>(
      'button[aria-label="Focus suite Root"]'
    )!;
    act(() => focusButton.click());
    expect(harness.container.querySelector(".relations-workspace-focus-chip")?.textContent)
      .toContain("Root");
    expect(harness.container.querySelector(".relations-view-item-focus-match")).not.toBeNull();

    harness.unmount();
  });

  it("clears focus when a refreshed snapshot no longer contains the suite", () => {
    const renderPane = (snapshot: ActiveSetSnapshot) => (
      <RelationsPane
        setId="set-1"
        snapshot={snapshot}
        isLoading={false}
        error={null}
        hasActiveSet={true}
        refreshControl={refreshControl}
      />
    );
    const harness = render(renderPane(makeNestedSnapshot()));

    act(() => harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Focus suite Child"]'
    )?.click());
    expect(harness.container.querySelector(".relations-workspace-focus-chip")).not.toBeNull();

    harness.rerender(renderPane(makeSnapshot()));

    expect(harness.container.querySelector(".relations-workspace-focus-chip")).toBeNull();
    expect(harness.container.querySelector(".relations-view-item-focus-dimmed")).toBeNull();
    harness.unmount();
  });

  it("falls back to a loading notice while waiting for the first snapshot", () => {
    const harness = render(
      <RelationsPane
        setId="set-1"
        snapshot={null}
        isLoading={true}
        error={null}
        hasActiveSet={true}
        refreshControl={refreshControl}
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
        isLoading={false}
        error="Set ghost not found."
        hasActiveSet={true}
        refreshControl={refreshControl}
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
