// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../app/composition/test-client-ports.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import { RelationsPane } from "./relations-pane.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState({}, "", "/");
});

describe("Magic-Sort-Diagnoseansicht contract v1", () => {
  it("MSD-01 keeps diagnostics out of the normal relations view and exposes it only with magicSortDebug=1", () => {
    const normal = renderPane("");
    expect(normal.host.querySelector("[data-magic-sort-diagnostics]")).toBeNull();
    normal.unmount();

    const disabled = renderPane("?magicSortDebug=0");
    expect(disabled.host.querySelector("[data-magic-sort-diagnostics]")).toBeNull();
    disabled.unmount();

    const debug = renderPane("?magicSortDebug=1");
    const panel = debug.host.querySelector("[data-magic-sort-diagnostics]");
    expect(panel).not.toBeNull();
    expect(debug.host.querySelector(".relations-workspace-toolbar")?.nextElementSibling).toBe(panel);
    debug.unmount();
  });

  it("MSD-02 and MSD-03 refresh the diagnostic state for every Magic Sort click, including a geometry fallback", () => {
    const harness = renderPane("?magicSortDebug=1");
    const button = harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')!;

    act(() => button.click());
    const panel = harness.host.querySelector<HTMLElement>("[data-magic-sort-diagnostics]");
    expect(panel).not.toBeNull();
    if (!panel) return;
    expect(panel.dataset.magicSortDiagnosticsState).toBe("fallback");
    expect(panel.textContent).toContain("DOM-Geometrie konnte nicht vollständig erfasst werden");
    expect(panel.querySelector('[data-magic-sort-diagnostics-metric="test-case-centers"]')?.textContent)
      .toMatch(/2.*Mittelpunkt.*Bereich/iu);
    expect(panel.querySelector('[data-magic-sort-diagnostics-metric="work-item-slot-count"]')?.textContent)
      .toMatch(/2.*Slot/iu);
    expect(panel.querySelector('[data-magic-sort-diagnostics-metric="work-item-slot-pitch"]')?.textContent)
      .toContain("nicht verfügbar");
    expect(panel.querySelector('[data-magic-sort-diagnostics-metric="searched-slot-range"]')?.textContent)
      .toMatch(/0.*1/);

    act(() => button.click());
    expect(panel.dataset.magicSortDiagnosticsRun).toBe("2");
    harness.unmount();
  });

  it("MSD-04 lists the measured distance, best examined slot and decision for each visible relation", () => {
    const harness = renderPane("?magicSortDebug=1");
    setMeasuredGeometry(harness.host);
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());

    const relations = [...harness.host.querySelectorAll<HTMLElement>("[data-magic-sort-diagnostic-relation]")];
    expect(relations.map((relation) => relation.dataset.magicSortDiagnosticRelation)).toEqual(["101:501", "102:502"]);
    relations.forEach((relation, index) => {
      expect(relation.textContent).toContain(`TC #${101 + index}`);
      expect(relation.textContent).toContain(`Bug #${501 + index}`);
      expect(relation.querySelector('[data-magic-sort-diagnostic-value="distance"]')?.textContent)
        .toMatch(/\d+ px/u);
      expect(relation.querySelector('[data-magic-sort-diagnostic-value="best-slot"]')?.textContent)
        .toMatch(/Slot \d+/u);
      expect(relation.querySelector('[data-magic-sort-diagnostic-reason]')?.textContent)
        .toMatch(/übernommen|kein zulässiger besserer Slot|durch die Optimierungsregel verworfen/iu);
    });
    harness.unmount();
  });

  it("MSD-02 shows real centre, slot and search-range measurements after a complete geometry capture", () => {
    const harness = renderPane("?magicSortDebug=1");
    setMeasuredGeometry(harness.host);
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());

    const panel = harness.host.querySelector<HTMLElement>("[data-magic-sort-diagnostics]");
    expect(panel?.dataset.magicSortDiagnosticsState).toBe("measured");
    expect(panel?.querySelector('[data-magic-sort-diagnostics-metric="test-case-centers"]')?.textContent)
      .toContain("50–120 px");
    expect(panel?.querySelector('[data-magic-sort-diagnostics-metric="work-item-slot-count"]')?.textContent)
      .toContain("2 Slots");
    expect(panel?.querySelector('[data-magic-sort-diagnostics-metric="work-item-slot-pitch"]')?.textContent)
      .toContain("60 px");
    expect(panel?.querySelector('[data-magic-sort-diagnostics-metric="searched-slot-range"]')?.textContent)
      .toContain("0–2");
    harness.unmount();
  });

  it("MSD-04 explains when a locally shorter slot is rejected by the global optimization rule", () => {
    const harness = renderPane("?magicSortDebug=1", conflictingSnapshot());
    setConflictingGeometry(harness.host);
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());

    expect(harness.host.querySelector(
      '[data-magic-sort-diagnostic-relation="102:502"] [data-magic-sort-diagnostic-reason]'
    )?.textContent ?? "").toContain("durch die Optimierungsregel verworfen");
    harness.unmount();
  });

  it("MSD-04 explains when a fully measured relation has no allowable better slot", () => {
    const harness = renderPane("?magicSortDebug=1");
    setOptimalGeometry(harness.host);
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());

    expect(harness.host.querySelector(
      '[data-magic-sort-diagnostic-relation="101:501"] [data-magic-sort-diagnostic-reason]'
    )?.textContent ?? "").toContain("kein zulässiger besserer Slot");
    harness.unmount();
  });

  it("MSD-05 and MSD-06 keep diagnostics transient and leave Magic Sort behavior unchanged", () => {
    const harness = renderPane("?magicSortDebug=1");
    const cardsBefore = [...harness.host.querySelectorAll(".relations-view-card")].map((card) => card.textContent);
    const savedLayoutBefore = localStorage.getItem("azure-testops.set-layouts.v1::diagnostic-set");
    harness.persistPreferences.mockClear();
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());

    expect([...harness.host.querySelectorAll(".relations-view-card")].map((card) => card.textContent)).toEqual(cardsBefore);
    expect(localStorage.getItem("azure-testops.set-layouts.v1::diagnostic-set")).toBe(savedLayoutBefore);
    expect(harness.persistPreferences).not.toHaveBeenCalled();
    expect(harness.relationMutations.add).not.toHaveBeenCalled();
    expect(harness.relationMutations.remove).not.toHaveBeenCalled();
    expect(harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.disabled).toBe(false);
    harness.unmount();
  });

  it("MSD-06 produces the same measured Magic Sort result with and without diagnostics", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const normal = renderPane("", invertedSnapshot());
    setMeasuredGeometry(normal.host);
    act(() => normal.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    const normalOrder = visibleWorkItemIds(normal.host);
    normal.unmount();

    const debug = renderPane("?magicSortDebug=1", invertedSnapshot());
    setMeasuredGeometry(debug.host);
    act(() => debug.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    expect(visibleWorkItemIds(debug.host)).toEqual(normalOrder);
    expect(visibleWorkItemIds(debug.host)).toEqual([502, 501]);
    debug.unmount();
  });

  it("MSD-06 does not sort on diagnostic-mode render and retains the existing accessible controls", () => {
    const harness = renderPane("?magicSortDebug=1", invertedSnapshot());
    expect(visibleWorkItemIds(harness.host)).toEqual([501, 502]);
    expect(harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')).not.toBeNull();
    expect(harness.host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);

    setMeasuredGeometry(harness.host);
    act(() => harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    expect(harness.host.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(harness.host.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.disabled).toBe(true);
    harness.unmount();
  });
});

function renderPane(search: string, activeSnapshot = snapshot()): {
  host: HTMLDivElement;
  persistPreferences: ReturnType<typeof vi.spyOn>;
  relationMutations: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  unmount(): void;
} {
  history.replaceState({}, "", `/${search}`);
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  const persistPreferences = vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const relationMutations = { add: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
  const ports = buildClientPortsStub({
    adoContext: {
      getContext: async () => null,
      setContext: async (context) => context,
      getCliDefaults: async () => ({ organization: "", project: "" })
    },
    relationMutations
  });
  act(() => root.render(
    <WithClientPorts ports={ports}>
      <RelationsPane
        setId="diagnostic-set"
        snapshot={activeSnapshot}
        isLoading={false}
        error={null}
        hasActiveSet
      />
    </WithClientPorts>
  ));
  return {
    host,
    persistPreferences,
    relationMutations,
    unmount() {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function setMeasuredGeometry(host: HTMLElement): void {
  const container = host.querySelector<HTMLElement>(".relations-view")!;
  setRect(container, 0, 300);
  setRect(host.querySelector<HTMLElement>(".relations-view-suite-header")!, 10, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="101"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="102"]')!, 100, 40);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="501"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="502"]')!, 100, 20);
}

function setConflictingGeometry(host: HTMLElement): void {
  const container = host.querySelector<HTMLElement>(".relations-view")!;
  setRect(container, 0, 300);
  setRect(host.querySelector<HTMLElement>(".relations-view-suite-header")!, 10, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="101"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="102"]')!, 65, 20);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="501"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="502"]')!, 140, 20);
}

function setOptimalGeometry(host: HTMLElement): void {
  const container = host.querySelector<HTMLElement>(".relations-view")!;
  setRect(container, 0, 300);
  setRect(host.querySelector<HTMLElement>(".relations-view-suite-header")!, 10, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="101"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-test-case-id="102"]')!, 100, 20);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="501"]')!, 40, 20);
  setRect(host.querySelector<HTMLElement>('[data-work-item-id="502"]')!, 100, 20);
}

function setRect(element: HTMLElement, top: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top, height })
  });
}

function visibleWorkItemIds(host: HTMLElement): number[] {
  return [...host.querySelectorAll<HTMLElement>(".relations-view-work-item-list > [data-work-item-id]")]
    .map((element) => Number(element.dataset.workItemId));
}

function snapshot(): ActiveSetSnapshot {
  return {
    set: { id: "diagnostic-set", name: "Diagnose", planId: "9", rootSuiteId: "1", queryId: "Q-1" },
    suiteTree: { id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] },
    projections: [101, 102].map((workItemId) => ({
      workItemId, suiteId: 1, suitePath: "Root", title: `Test Case ${workItemId}`, state: "Design",
      workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null, priority: null,
      relatedIds: [workItemId + 400], testPointId: null, configurationId: null, configurationName: null,
      lastOutcome: "Passed", lastResultId: workItemId - 10, lastResultCompletedDate: "2026-09-09T08:00:00.000Z", lastRunId: 12
    })),
    workItemsFromQuery: [501, 502].map((id) => ({
      id, workItemType: "Bug", title: `Visible Bug ${id}`, state: "Active", assignedTo: null,
      tags: [], areaPath: null, priority: null, relatedIds: [id - 400]
    })),
    loadedAt: "2026-09-09T08:00:00.000Z"
  };
}

function invertedSnapshot(): ActiveSetSnapshot {
  const base = snapshot();
  return {
    ...base,
    projections: base.projections.map((projection) => ({
      ...projection,
      relatedIds: [projection.workItemId === 101 ? 502 : 501]
    })),
    workItemsFromQuery: base.workItemsFromQuery.map((workItem) => ({
      ...workItem,
      relatedIds: [workItem.id === 501 ? 102 : 101]
    }))
  };
}

function conflictingSnapshot(): ActiveSetSnapshot {
  return snapshot();
}
