// @vitest-environment jsdom
import * as React from "react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { act } from "react";
import { userEvent } from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../app/composition/test-client-ports.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { RelationsPane } from "./relations-pane.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refreshControl = <button type="button">Refresh</button>;

function snapshot(): ActiveSetSnapshot {
  return {
    set: { id: "set-focus-conflict", name: "Focus conflict", planId: "9", rootSuiteId: "1", queryId: "Q-focus" },
    suiteTree: { id: 1, name: "Payments", parentSuiteId: null, path: "Payments", children: [] },
    projections: [projection(101, "Declined payment reports an error", "Failed"), projection(102, "Approved payment", "Passed")],
    workItemsFromQuery: [{
      id: 501,
      workItemType: "Bug",
      title: "Payment bug is closed despite a failed test",
      state: "Closed",
      assignedTo: null,
      tags: [],
      areaPath: null,
      priority: null,
      relatedIds: [101, 102]
    }],
    loadedAt: "2026-08-26T10:00:00.000Z"
  };
}

function renderPane(): { container: HTMLDivElement; unmount(): void } {
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ports = buildClientPortsStub({
    adoContext: {
      getContext: async () => null,
      setContext: async (context) => context,
      getCliDefaults: async () => ({ organization: "", project: "" })
    },
    relationMutations: { add: async () => undefined, remove: async () => undefined }
  });
  act(() => {
    root.render(
      <WithClientPorts ports={ports}>
        <RelationsPane
          setId="set-focus-conflict"
          snapshot={snapshot()}
          isLoading={false}
          error={null}
          hasActiveSet
          refreshControl={refreshControl}
        />
      </WithClientPorts>
    );
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
    }
  };
}

describe("Relation card focus contract v2", () => {
  it("RCF-07 keeps a focused status-conflict line red while a matching focused line remains primary-colored", async () => {
    const harness = renderPane();
    const bug = harness.container.querySelector<HTMLElement>('[data-work-item-id="501"] .relations-view-card-work-item');
    expect(bug).not.toBeNull();
    const focusControl = bug?.querySelector<HTMLButtonElement>(".relations-view-card-focus");
    expect(focusControl).not.toBeNull();

    const user = userEvent.setup();
    await act(async () => { await user.click(focusControl!); });

    const conflictLine = harness.container.querySelector<SVGGElement>('[data-line-id="101::501"]');
    const matchingLine = harness.container.querySelector<SVGGElement>('[data-line-id="102::501"]');
    expect(conflictLine?.classList.contains("relations-view-line-focus-conflict")).toBe(true);
    expect(conflictLine?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(matchingLine?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(matchingLine?.classList.contains("relations-view-line-focus-conflict")).toBe(false);

    const stylesheet = await readFile(resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");
    const focusMatchRule = stylesheet.indexOf(".relations-view-line-focus-match .relations-view-line-stroke");
    const focusConflictRule = stylesheet.indexOf(".relations-view-line-focus-conflict .relations-view-line-stroke");
    expect(focusMatchRule).toBeGreaterThan(-1);
    expect(focusConflictRule).toBeGreaterThan(focusMatchRule);
    expect(stylesheet.slice(focusConflictRule, focusConflictRule + 180)).toContain("stroke: var(--color-danger)");
    expect(stylesheet.slice(focusMatchRule, focusMatchRule + 180)).toContain("stroke: var(--color-primary)");
    harness.unmount();
  });
});

function projection(workItemId: number, title: string, lastOutcome: "Failed" | "Passed") {
  return {
    workItemId,
    suiteId: 1,
    suitePath: "Payments",
    title,
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
    lastOutcome,
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}
