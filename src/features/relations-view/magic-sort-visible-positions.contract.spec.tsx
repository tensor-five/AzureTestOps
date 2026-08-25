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
import { planMagicSort, type MagicSortInput } from "./magic-sort-layout.js";
import { RelationsPane } from "./relations-pane.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type VisibleRow =
  | { kind: "suite-header"; suiteId: number }
  | { kind: "test-case"; suiteId: number; testCaseId: number };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Magic Sort visible positions contract v1", () => {
  it("MSV-02 through MSV-05 count suite headers as rows and keep an equally good layout unchanged", () => {
    const input = visiblePositionInput([
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "suite-header", suiteId: 12 },
      { kind: "test-case", suiteId: 12, testCaseId: 102 }
    ]);

    const plan = planMagicSort(input as MagicSortInput);

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.workItemIds).toEqual([202, 201]);
  });

  it("MSV-01 and MSV-02 exclude Test Cases inside a collapsed suite from the layout cost", () => {
    vi.useFakeTimers();
    const harness = renderPane({
      setLayouts: {
        "set-visible-positions": {
          collapsedSuites: ["11"],
          workItemOrder: [202, 201],
          testCaseOrder: { "11": [101], "12": [102] }
        }
      }
    });

    expect(harness.container.querySelector('[data-suite-id="11"]')?.getAttribute("aria-expanded"))
      .toBe("false");
    expect(harness.container.querySelector('[data-test-case-id="101"]')).toBeNull();

    act(() => harness.container.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    act(() => vi.runAllTimers());

    expect(workItemIds(harness.container)).toEqual([202, 201]);
    harness.unmount();
  });

  it("MSV-01 ignores a filtered Test Case and preserves the remaining visible layout", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const harness = renderPane({
      setLayouts: {
        "set-visible-positions": {
          workItemOrder: [202, 201],
          testCaseOrder: { "11": [101], "12": [102] }
        }
      }
    });
    const search = harness.container.querySelector<HTMLInputElement>(
      '.relations-view-column-test-cases input[type="search"]'
    );
    expect(search).not.toBeNull();

    await user.type(search!, "Visible test");
    expect(harness.container.querySelector('[data-test-case-id="101"]')).toBeNull();

    act(() => harness.container.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    act(() => vi.runAllTimers());

    expect(workItemIds(harness.container)).toEqual([202, 201]);
    harness.unmount();
  });

  it("MSV-01 ignores a filtered Bug and preserves its stored position", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const harness = renderPane({
      setLayouts: {
        "set-visible-positions": {
          workItemOrder: [202, 201],
          testCaseOrder: { "11": [101], "12": [102] }
        }
      }
    });
    const search = harness.container.querySelector<HTMLInputElement>(
      '.relations-view-column-work-items input[type="search"]'
    );
    expect(search).not.toBeNull();

    await user.type(search!, "Bug 202");
    expect(workItemIds(harness.container)).toEqual([202]);
    act(() => harness.container.querySelector<HTMLButtonElement>('button[aria-label="Magic Sort"]')?.click());
    act(() => vi.runAllTimers());
    await user.clear(search!);

    expect(workItemIds(harness.container)).toEqual([202, 201]);
    harness.unmount();
  });

  it("MSV-04 reduces crossings using the same visible positions that include suite headers", () => {
    const input = {
      ...visiblePositionInput([
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "suite-header", suiteId: 12 },
        { kind: "test-case", suiteId: 12, testCaseId: 102 }
      ]),
      workItems: [
        { id: 202, relatedTestCaseIds: [102] },
        { id: 201, relatedTestCaseIds: [101] }
      ]
    };
    const before = visibleMetrics(input, input.workItemIds);
    const after = visibleMetrics(input, planMagicSort(input as MagicSortInput).steps.at(-1)!.workItemIds);

    expect(before.crossings).toBeGreaterThan(0);
    expect(after.crossings).toBeLessThan(before.crossings);
  });
});

function visiblePositionInput(visibleRows: readonly VisibleRow[]) {
  return {
    suites: [
      { suiteId: 11, testCaseIds: [101] },
      { suiteId: 12, testCaseIds: [102] }
    ],
    visibleRows,
    workItemIds: [202, 201],
    workItems: [
      { id: 202, relatedTestCaseIds: [] },
      { id: 201, relatedTestCaseIds: [101] }
    ]
  };
}

function renderPane(preferences: UserPreferences): { container: HTMLDivElement; unmount(): void } {
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue(preferences);
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockImplementation((patch) => {
    preferences.setLayouts = { ...preferences.setLayouts, ...patch.setLayouts };
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ports = buildClientPortsStub({
    adoContext: { getContext: async () => null, setContext: async (context) => context, getCliDefaults: async () => ({ organization: "", project: "" }) },
    relationMutations: { add: async () => undefined, remove: async () => undefined }
  });
  act(() => root.render(<WithClientPorts ports={ports}><RelationsPane setId="set-visible-positions" snapshot={snapshot()} isLoading={false} error={null} hasActiveSet refreshControl={<button type="button">Refresh</button>} /></WithClientPorts>));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

function workItemIds(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[data-work-item-id]")].map((item) => Number(item.dataset.workItemId));
}

function visibleMetrics(
  input: ReturnType<typeof visiblePositionInput>,
  workItemIds: readonly number[]
): { crossings: number } {
  const testCasePositions = new Map<number, number>();
  input.visibleRows.forEach((row, position) => {
    if (row.kind === "test-case") {
      testCasePositions.set(row.testCaseId, position);
    }
  });
  const workItemPositions = new Map(workItemIds.map((id, position) => [id, position]));
  const edges = input.workItems.flatMap((workItem) => workItem.relatedTestCaseIds
    .filter((testCaseId) => testCasePositions.has(testCaseId) && workItemPositions.has(workItem.id))
    .map((testCaseId) => ({ left: testCasePositions.get(testCaseId)!, right: workItemPositions.get(workItem.id)! }))
  );
  return { crossings: edges.reduce((total, edge, index) => total + edges.slice(index + 1)
    .filter((other) => (edge.left - other.left) * (edge.right - other.right) < 0).length, 0) };
}

function snapshot(): ActiveSetSnapshot {
  return {
    set: { id: "set-visible-positions", name: "Visible positions", planId: "9", rootSuiteId: "10", queryId: "Q-1" },
    suiteTree: { id: 10, name: "Root", parentSuiteId: null, path: "Root", children: [
      { id: 11, name: "Collapsed suite", parentSuiteId: 10, path: "Root > Collapsed", children: [] },
      { id: 12, name: "Visible suite", parentSuiteId: 10, path: "Root > Visible", children: [] }
    ] },
    projections: [projection(101, 11, "Hidden test"), projection(102, 12, "Visible test")],
    workItemsFromQuery: [workItem(201, [101]), workItem(202, [])],
    loadedAt: "2026-08-25T12:00:00.000Z"
  };
}

function projection(workItemId: number, suiteId: number, title: string) {
  return { workItemId, suiteId, suitePath: "Root", title, state: "Design", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [], testPointId: null, configurationId: null, configurationName: null, lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null };
}

function workItem(id: number, relatedIds: number[]) {
  return { id, title: `Bug ${id}`, workItemType: "Bug", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds };
}
