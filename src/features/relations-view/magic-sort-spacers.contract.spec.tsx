// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeUserPreferences } from "../../shared/user-preferences/user-preferences.schema.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { AppHeader, type AppHeaderProps } from "../navigation/header.js";
import { planMagicSort, type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { MagicSortAction, type MagicSortActionProps } from "./magic-sort-action.js";
import { clearSetLayoutPreferenceForTests, setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import { WorkItemColumn, type WorkItemColumnProps } from "./work-item-column.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SpacerActionProps = MagicSortActionProps & {
  addSpacer: boolean;
  onAddSpacerChange(next: boolean): void;
};

const SpacerMagicSortAction = MagicSortAction as unknown as React.ComponentType<SpacerActionProps>;
const relationsCss = await readFile(path.resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");
type SpacerWorkItemColumnProps = WorkItemColumnProps & {
  addSpacer: boolean;
  workItemPositions: Readonly<Record<number, number>>;
};
const SpacerWorkItemColumn = WorkItemColumn as unknown as React.ComponentType<SpacerWorkItemColumnProps>;

afterEach(() => {
  vi.restoreAllMocks();
  clearSetLayoutPreferenceForTests();
  localStorage.clear();
});

describe("Magic Sort spacers contract v1", () => {
  it("MSS-01 renders the keyboard-operable Add Spacer checkbox beside Magic Sort", async () => {
    const onAddSpacerChange = vi.fn();
    const harness = renderAction({ onAddSpacerChange });
    const checkbox = harness.host.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(harness.host.querySelector(".ui-shell-magic-sort-slot")?.contains(checkbox)).toBe(true);
    expect(checkbox?.labels?.[0]?.textContent).toContain("Add Spacer");
    checkbox?.focus();
    await userEvent.setup().keyboard(" ");
    expect(onAddSpacerChange).toHaveBeenCalledWith(true);

    harness.unmount();
  });

  it("MSS-02 defaults Add Spacer to disabled and preserves the enabled value when its set is restored", () => {
    const defaults = sanitizeUserPreferences({
      setLayouts: { "set-1": {} }
    });
    const restored = sanitizeUserPreferences({
      setLayouts: { "set-1": { magicSortAddSpacer: true } }
    });

    expect(addSpacerPreference(defaults, "set-1") ?? false).toBe(false);
    expect(addSpacerPreference(restored, "set-1")).toBe(true);

    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue(restored);
    vi.spyOn(preferencesClient, "isUserPreferencesCacheAuthoritative").mockReturnValue(true);
    const persist = vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
    expect(addSpacerPreferenceFromLayout(setLayoutPreferenceStore.load({ scopeKey: "set-1" }))).toBe(true);
    expect(addSpacerPreferenceFromLayout(setLayoutPreferenceStore.load({ scopeKey: "set-2" })) ?? false).toBe(false);

    setLayoutPreferenceStore.save({ magicSortAddSpacer: false } as never, { scopeKey: "set-1" });
    expect(persist).toHaveBeenCalledWith({ setLayouts: { "set-1": { magicSortAddSpacer: false } } });
  });

  it("MSS-03 retains the dense Bug positions while Add Spacer is disabled", () => {
    const plan = planMagicSort(spacerInput(false));

    expect(workItemPositions(plan.steps.at(-1)!)).toBeUndefined();
  });

  it("MSS-04 through MSS-06 allocate distinct free Bug slots nearest to visible Test Case positions", () => {
    const plan = planMagicSort(spacerInput(true));
    const layout = plan.steps.at(-1)!;

    expect(workItemPositions(layout)).toEqual({ 201: 1, 202: 3 });
    expect(new Set(Object.values(workItemPositions(layout) ?? {})).size).toBe(2);
  });

  it("MSS-05 keeps crossings non-increasing while free slots reduce positional distance", () => {
    const input = spacerInput(true);
    const before = spacerMetrics(input, input.workItemIds, { 201: 0, 202: 1 });
    const layout = planMagicSort(input).steps.at(-1)!;
    expect(workItemPositions(layout)).toBeDefined();
    const after = spacerMetrics(input, layout.workItemIds, workItemPositions(layout) ?? {});

    expect(after.length).toBeLessThan(before.length);
    expect(after.crossings).toBeLessThanOrEqual(before.crossings);
  });

  it("MSS-06 ignores collapsed Test Cases and keeps Test Case ids inside their own suite", () => {
    const input = spacerInput(true);
    input.suites = [
      { suiteId: 11, testCaseIds: [101] },
      { suiteId: 12, testCaseIds: [] }
    ];
    input.visibleRows = [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "suite-header", suiteId: 12 }
    ];
    input.workItems = [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [] }
    ];

    const layout = planMagicSort(input).steps.at(-1)!;

    expect(layout.suites).toEqual([
      { suiteId: 11, testCaseIds: [101] },
      { suiteId: 12, testCaseIds: [] }
    ]);
    expect(workItemPositions(layout)?.[201]).toBe(1);
  });

  it("MSS-06 preserves every Test Case in its suite when dense Magic Sort reorders visible cases", () => {
    const input = spacerInput(false);
    input.suites = [{ suiteId: 11, testCaseIds: [102, 101] }];
    input.visibleRows = [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 }
    ];
    input.workItems = [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [101] }
    ];

    const layout = planMagicSort(input).steps.at(-1)!;

    expect(layout.suites).toEqual([{ suiteId: 11, testCaseIds: [101, 102] }]);
  });

  it("MSS-07 renders free slots without Bug cards and animates their vertical movement", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<SpacerWorkItemColumn
      workItems={[workItem(201), workItem(202)]}
      unfilteredCount={2}
      addSpacer
      workItemPositions={{ 201: 1, 202: 4 }}
    />));

    const slots = host.querySelectorAll<HTMLElement>("[data-work-item-spacer]");
    expect(slots).toHaveLength(2);
    expect([...slots].every((slot) => slot.querySelector("[data-work-item-id]") === null)).toBe(true);
    expect(relationsCss).toMatch(/\.relations-view-work-item-spacer\s*\{[^}]*transition:/s);

    act(() => root.unmount());
    host.remove();
  });
});

function renderAction(overrides: Partial<SpacerActionProps>): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<HeaderWithSpacerAction
    preflightStatus="READY"
    themeMode="system"
    onToggleTheme={() => undefined}
    setSwitcher={<button type="button">Set</button>}
    magicSortAction={<SpacerMagicSortAction
      onStart={() => undefined}
      isRunning={false}
      status=""
      addSpacer={false}
      onAddSpacerChange={() => undefined}
      {...overrides}
    />}
  />));
  return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

const HeaderWithSpacerAction = AppHeader as React.ComponentType<AppHeaderProps & { magicSortAction?: React.ReactNode }>;

function workItemPositions(layout: MagicSortLayout): Readonly<Record<number, number>> | undefined {
  return (layout as MagicSortLayout & { workItemPositions?: Readonly<Record<number, number>> }).workItemPositions;
}

function addSpacerPreference(preferences: { setLayouts?: Record<string, unknown> }, setId: string): boolean | undefined {
  return addSpacerPreferenceFromLayout(preferences.setLayouts?.[setId]);
}

function addSpacerPreferenceFromLayout(layout: unknown): boolean | undefined {
  if (!layout || typeof layout !== "object") {
    return undefined;
  }
  const value = (layout as { magicSortAddSpacer?: unknown }).magicSortAddSpacer;
  return typeof value === "boolean" ? value : undefined;
}

function spacerInput(addSpacer: boolean): MagicSortInput {
  return {
    suites: [
      { suiteId: 11, testCaseIds: [101] },
      { suiteId: 12, testCaseIds: [102] }
    ],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "suite-header", suiteId: 12 },
      { kind: "test-case", suiteId: 12, testCaseId: 102 },
      { kind: "suite-header", suiteId: 13 }
    ],
    workItemIds: [201, 202],
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [102] }
    ],
    addSpacer
  } as MagicSortInput;
}

function spacerMetrics(
  input: MagicSortInput,
  workItemIds: readonly number[],
  positions: Readonly<Record<number, number>>
): { crossings: number; length: number } {
  const testCasePositions = new Map<number, number>();
  input.visibleRows?.forEach((row, position) => {
    if (row.kind === "test-case") {
      testCasePositions.set(row.testCaseId, position);
    }
  });
  const edges = input.workItems.flatMap((workItem) => workItem.relatedTestCaseIds
    .filter((testCaseId) => testCasePositions.has(testCaseId) && workItemIds.includes(workItem.id))
    .map((testCaseId) => ({ left: testCasePositions.get(testCaseId)!, right: positions[workItem.id]! }))
  );
  return {
    crossings: edges.reduce((total, edge, index) => total + edges.slice(index + 1)
      .filter((other) => (edge.left - other.left) * (edge.right - other.right) < 0).length, 0),
    length: edges.reduce((total, edge) => total + Math.abs(edge.left - edge.right), 0)
  };
}

function workItem(id: number) {
  return {
    id,
    title: `Bug ${id}`,
    workItemType: "Bug",
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: []
  };
}
