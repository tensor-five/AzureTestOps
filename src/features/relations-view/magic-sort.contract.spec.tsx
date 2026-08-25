// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../app/composition/test-client-ports.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import type { UserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import { RelationsPane } from "./relations-pane.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPane(
  snapshot = makeSnapshot(),
  options: { preferences?: UserPreferences; resetStores?: boolean } = {}
): TestHarness {
  if (options.resetStores !== false) {
    clearSetLayoutPreferenceForTests();
    clearSetFilterPreferenceForTests();
  }
  const preferences = options.preferences ?? {
    setLayouts: {
      "set-magic": {
        workItemOrder: [404, 303, 202, 101],
        testCaseOrder: { "11": [3, 2, 1], "12": [4] }
      }
    }
  } satisfies UserPreferences;
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockImplementation(() => preferences);
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockImplementation((patch) => {
    preferences.setLayouts = { ...preferences.setLayouts, ...patch.setLayouts };
  });

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
          setId="set-magic"
          snapshot={snapshot}
          isLoading={false}
          error={null}
          hasActiveSet
          refreshControl={<button type="button">Refresh</button>}
        />
      </WithClientPorts>
    );
  });
  return {
    container,
    rerender: (nextSnapshot) => {
      act(() => {
        root.render(
          <WithClientPorts ports={ports}>
            <RelationsPane
              setId="set-magic"
              snapshot={nextSnapshot}
              isLoading={false}
              error={null}
              hasActiveSet
              refreshControl={<button type="button">Refresh</button>}
            />
          </WithClientPorts>
        );
      });
    },
    preferences,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
    }
  };
}

type TestHarness = {
  container: HTMLDivElement;
  preferences: UserPreferences;
  rerender(snapshot: ActiveSetSnapshot): void;
  unmount(): void;
};

describe("Magic Sort contract v1", () => {
  it("MS-01 exposes the keyboard-operable Magic Sort action with a wand symbol", () => {
    const harness = renderPane();

    const action = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Magic Sort"]'
    );
    expect(action).not.toBeNull();
    expect(action?.textContent).toContain("Magic Sort");
    expect(action?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    harness.unmount();
  });

  it("MS-02 preserves the existing stored order until the user chooses Magic Sort", () => {
    const harness = renderPane();

    expect(harness.container.querySelector('button[aria-label="Magic Sort"]')).not.toBeNull();
    expect(workItemIds(harness.container)).toEqual([404, 303, 202, 101]);
    expect(testCaseIdsInSuite(harness.container, 11)).toEqual([3, 2, 1]);
    expect(harness.container.querySelector('[role="status"]')?.textContent ?? "").not.toContain(
      "Magic Sort"
    );

    harness.unmount();
  });

  it("MS-03 and MS-06 begin a live optimization only after the user triggers Magic Sort", () => {
    const harness = renderPane();
    const action = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Magic Sort"]'
    );
    expect(action).not.toBeNull();

    act(() => action?.click());

    const status = harness.container.querySelector<HTMLElement>(
      '[role="status"][aria-live="polite"]'
    );
    expect(status?.textContent).toContain("Magic Sort");
    expect(status?.textContent).toMatch(/optim|anordn|verbesser/i);

    harness.unmount();
  });

  it("MS-04 keeps every test case in its own suite while Magic Sort improves the visible layout", () => {
    const harness = renderPane();
    const action = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Magic Sort"]'
    );
    expect(action).not.toBeNull();

    act(() => action?.click());

    expect(testCaseIdsInSuite(harness.container, 11).sort()).toEqual([1, 2, 3]);
    expect(testCaseIdsInSuite(harness.container, 12)).toEqual([4]);

    harness.unmount();
  });

  it("MS-08 provides no undo action and MS-09 announces completion independently of colour", () => {
    const harness = renderPane();
    const action = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Magic Sort"]'
    );
    expect(action).not.toBeNull();

    act(() => action?.click());

    expect(harness.container.querySelector('button[aria-label*="Undo" i]')).toBeNull();
    expect(harness.container.querySelector('[role="status"][aria-live="polite"]')?.textContent)
      .toMatch(/optim|anordn|fertig|abgeschlossen/i);

    harness.unmount();
  });

  it("MS-02 does not reorder after a filter change or a snapshot refresh", async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    expect(magicSortAction(harness.container)).not.toBeNull();
    const before = workItemIds(harness.container);
    const search = harness.container.querySelector<HTMLInputElement>(
      '.relations-view-column-work-items input[type="search"]'
    );
    expect(search).not.toBeNull();

    await user.type(search!, "Bug 404");
    expect(workItemIds(harness.container)).toEqual([404]);
    await user.clear(search!);
    expect(workItemIds(harness.container)).toEqual(before);

    harness.rerender({ ...makeSnapshot(), loadedAt: "2026-08-25T10:05:00.000Z" });
    expect(workItemIds(harness.container)).toEqual(before);
    harness.unmount();
  });

  it("MS-03 starts only for a keyboard-triggered Magic Sort action and uses only the visible items", async () => {
    const user = userEvent.setup();
    const harness = renderPane(makeSubsetSnapshot());
    const action = magicSortAction(harness.container);
    expect(action).not.toBeNull();
    expect(magicSortStatus(harness.container)?.textContent ?? "").not.toContain("Magic Sort");
    const originalHiddenOrder = workItemIds(harness.container).filter((id) => id === 404 || id === 303);

    const search = harness.container.querySelector<HTMLInputElement>(
      '.relations-view-column-work-items input[type="search"]'
    );
    await user.type(search!, "Selected bug");
    expect(workItemIds(harness.container)).toHaveLength(2);
    action!.focus();
    await user.keyboard("{Enter}");

    await user.clear(search!);
    expect(workItemIds(harness.container).filter((id) => id === 404 || id === 303))
      .toEqual(originalHiddenOrder);
    expect(magicSortStatus(harness.container)?.textContent).toContain("Magic Sort");
    harness.unmount();
  });

  it("MS-05 and MS-06 lower the layout cost through visible accepted improvements", () => {
    vi.useFakeTimers();
    const harness = renderPane(makeDenseSnapshot());
    const initialMetrics = layoutMetrics(harness.container, makeDenseSnapshot());
    const initialPositions = readVisiblePositions(harness.container);
    const action = magicSortAction(harness.container);
    expect(action).not.toBeNull();

    act(() => action?.click());
    act(() => vi.advanceTimersByTime(120));
    const intermediateMetrics = layoutMetrics(harness.container, makeDenseSnapshot());
    const intermediatePositions = readVisiblePositions(harness.container);
    const intermediateStatus = magicSortStatus(harness.container)?.textContent ?? "";
    act(() => vi.runAllTimers());
    const completedMetrics = layoutMetrics(harness.container, makeDenseSnapshot());

    expect(intermediatePositions).not.toEqual(initialPositions);
    expect(intermediateMetrics.crossings).toBeLessThanOrEqual(initialMetrics.crossings);
    expect(intermediateMetrics.length).toBeLessThanOrEqual(initialMetrics.length);
    expect(
      intermediateMetrics.crossings < initialMetrics.crossings || intermediateMetrics.length < initialMetrics.length
    ).toBe(true);
    expect(intermediateStatus).toContain("Magic Sort");
    expect(intermediateStatus).not.toMatch(/fertig|abgeschlossen/i);
    expect(completedMetrics.crossings).toBeLessThanOrEqual(intermediateMetrics.crossings);
    expect(completedMetrics.length).toBeLessThanOrEqual(intermediateMetrics.length);
    expect(
      completedMetrics.crossings < initialMetrics.crossings || completedMetrics.length < initialMetrics.length
    ).toBe(true);
    expect(magicSortStatus(harness.container)?.textContent).toMatch(/optim|anordn|fertig|abgeschlossen/i);
    harness.unmount();
    vi.useRealTimers();
  });

  it("MS-05 returns the same result for identical inputs", () => {
    vi.useFakeTimers();
    const first = renderPane(makeDenseSnapshot());
    const firstAction = magicSortAction(first.container);
    expect(firstAction).not.toBeNull();
    act(() => firstAction?.click());
    act(() => vi.runAllTimers());
    const firstOrder = workItemIds(first.container);
    const firstTestCaseOrder = allTestCaseIds(first.container);
    first.unmount();

    const second = renderPane(makeDenseSnapshot());
    const secondAction = magicSortAction(second.container);
    expect(secondAction).not.toBeNull();
    act(() => secondAction?.click());
    act(() => vi.runAllTimers());
    expect(workItemIds(second.container)).toEqual(firstOrder);
    expect(allTestCaseIds(second.container)).toEqual(firstTestCaseOrder);
    second.unmount();
    vi.useRealTimers();
  });

  it("MS-06 finishes immediately when reduced motion is preferred", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const harness = renderPane(makeDenseSnapshot());
    const before = layoutMetrics(harness.container, makeDenseSnapshot());
    const action = magicSortAction(harness.container);
    expect(action).not.toBeNull();
    act(() => action?.click());

    const completed = layoutMetrics(harness.container, makeDenseSnapshot());
    expect(completed.crossings).toBeLessThanOrEqual(before.crossings);
    expect(completed.length).toBeLessThanOrEqual(before.length);
    expect(completed.crossings < before.crossings || completed.length < before.length).toBe(true);
    expect(magicSortStatus(harness.container)?.textContent).toMatch(/optim|anordn|fertig|abgeschlossen/i);
    harness.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("MS-07 persists and restores both optimized orders for the active set", () => {
    vi.useFakeTimers();
    const preferences: UserPreferences = { setLayouts: { "set-magic": {
      workItemOrder: [404, 303, 202, 101], testCaseOrder: { "11": [3, 2, 1], "12": [4] }
    } } };
    const first = renderPane(makeDenseSnapshot(), { preferences });
    const action = magicSortAction(first.container);
    expect(action).not.toBeNull();
    act(() => action?.click());
    act(() => vi.runAllTimers());
    const expectedWorkItems = workItemIds(first.container);
    const expectedTestCases = allTestCaseIds(first.container);
    expect(preferences.setLayouts?.["set-magic"]?.workItemOrder).toEqual(expectedWorkItems);
    expect(preferences.setLayouts?.["set-magic"]?.testCaseOrder).toBeDefined();
    first.unmount();

    const restored = renderPane(makeDenseSnapshot(), { preferences, resetStores: false });
    expect(workItemIds(restored.container)).toEqual(expectedWorkItems);
    expect(allTestCaseIds(restored.container)).toEqual(expectedTestCases);
    restored.unmount();
    vi.useRealTimers();
  });

  it("MS-09 changes a text status while Magic Sort is running and after it completes", () => {
    vi.useFakeTimers();
    const harness = renderPane(makeDenseSnapshot());
    const action = magicSortAction(harness.container);
    expect(action).not.toBeNull();
    act(() => action?.click());
    const running = magicSortStatus(harness.container)?.textContent;
    act(() => vi.runAllTimers());
    const completed = magicSortStatus(harness.container)?.textContent;

    expect(running).toContain("Magic Sort");
    expect(completed).toContain("Magic Sort");
    expect(completed).not.toBe(running);
    harness.unmount();
    vi.useRealTimers();
  });
});

function magicSortAction(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]');
}

function magicSortStatus(container: HTMLElement): HTMLElement | null {
  return [...container.querySelectorAll<HTMLElement>('[role="status"][aria-live="polite"]')]
    .find((element) => element.textContent?.includes("Magic Sort")) ?? null;
}

function allTestCaseIds(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[data-test-case-id]")]
    .map((element) => Number(element.dataset.testCaseId));
}

function readVisiblePositions(container: HTMLElement): { workItems: number[]; testCases: number[] } {
  return { workItems: workItemIds(container), testCases: allTestCaseIds(container) };
}

function layoutMetrics(container: HTMLElement, snapshot: ActiveSetSnapshot): { crossings: number; length: number } {
  const testCasePosition = new Map(allTestCaseIds(container).map((id, index) => [id, index]));
  const workItemPosition = new Map(workItemIds(container).map((id, index) => [id, index]));
  const edges = snapshot.workItemsFromQuery.flatMap((workItem) => workItem.relatedIds
    .filter((testCaseId) => testCasePosition.has(testCaseId) && workItemPosition.has(workItem.id))
    .map((testCaseId) => ({ left: testCasePosition.get(testCaseId)!, right: workItemPosition.get(workItem.id)! }))
  );
  const crossings = edges.reduce((total, edge, index) => total + edges.slice(index + 1)
    .filter((other) => (edge.left - other.left) * (edge.right - other.right) < 0).length, 0);
  const length = edges.reduce((total, edge) => total + Math.abs(edge.left - edge.right), 0);
  return { crossings, length };
}

function workItemIds(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[data-work-item-id]")]
    .map((element) => Number(element.dataset.workItemId));
}

function testCaseIdsInSuite(container: HTMLElement, suiteId: number): number[] {
  const suite = container.querySelector<HTMLElement>(
    `[data-suite-cards][data-suite-id="${suiteId}"]`
  );
  return [...(suite?.querySelectorAll<HTMLElement>("[data-test-case-id]") ?? [])]
    .map((element) => Number(element.dataset.testCaseId));
}

function makeSnapshot(): ActiveSetSnapshot {
  return {
    set: { id: "set-magic", name: "Magic Sort", planId: "9", rootSuiteId: "10", queryId: "Q-1" },
    suiteTree: {
      id: 10,
      name: "Root",
      parentSuiteId: null,
      path: "Root",
      children: [
        { id: 11, name: "Authentication", parentSuiteId: 10, path: "Root > Authentication", children: [] },
        { id: 12, name: "Permissions", parentSuiteId: 10, path: "Root > Permissions", children: [] }
      ]
    },
    projections: [
      projection(1, 11, "Login"),
      projection(2, 11, "Session"),
      projection(3, 11, "Password"),
      projection(4, 12, "Roles")
    ],
    workItemsFromQuery: [
      workItem(101, [1]), workItem(202, [2]), workItem(303, [3]), workItem(404, [4])
    ],
    loadedAt: "2026-08-25T10:00:00.000Z"
  };
}

function makeDenseSnapshot(): ActiveSetSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    workItemsFromQuery: [
      workItem(101, [4, 3]),
      workItem(202, [3, 2]),
      workItem(303, [2, 1]),
      workItem(404, [1, 4])
    ]
  };
}

function makeSubsetSnapshot(): ActiveSetSnapshot {
  const snapshot = makeDenseSnapshot();
  return {
    ...snapshot,
    workItemsFromQuery: snapshot.workItemsFromQuery.map((item) => ({
      ...item,
      title: item.id === 101 || item.id === 202 ? `Selected bug ${item.id}` : `Other bug ${item.id}`
    }))
  };
}

function projection(workItemId: number, suiteId: number, title: string) {
  return {
    workItemId,
    suiteId,
    suitePath: suiteId === 11 ? "Root > Authentication" : "Root > Permissions",
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
    lastOutcome: "Passed",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

function workItem(id: number, relatedIds: number[]) {
  return {
    id,
    title: `Bug ${id}`,
    workItemType: "Bug",
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds
  };
}
