// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planMagicSort, type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { useMagicSort } from "./use-magic-sort.js";
import { useMagicSortSpacerOption } from "./use-magic-sort-spacer-option.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  clearSetLayoutPreferenceForTests();
  vi.unstubAllGlobals();
});

describe("Magic Sort compact unlinked Bugs contract v1", () => {
  it("MCU-01 and MCU-02 reset stale unlinked slots and keep unlinked Bugs compact in their existing order", () => {
    const layout = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 }
      ],
      addSpacer: true,
      workItemIds: [202, 203, 201],
      workItemPositions: { 201: 3, 202: 96, 203: 99 },
      workItems: [
        { id: 201, relatedTestCaseIds: [101] },
        { id: 202, relatedTestCaseIds: [] },
        { id: 203, relatedTestCaseIds: [] }
      ]
    }).steps[0]!;

    expect(layout.workItemIds).toEqual([202, 203, 201]);
    expect(layout.workItemPositions).toEqual({ 201: 3, 202: 0, 203: 1 });
  });

  it("MCU-01 and MCU-02 apply and persist compact unlinked slots after a Magic Sort click", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    localStorage.setItem("azure-testops.set-layouts.v1::compact-unlinked", JSON.stringify({
      magicSortAddSpacer: true,
      workItemSpacerPositions: { "201": 3, "202": 96, "203": 99 }
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(React.createElement(PersistedMagicSortHarness)));
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());

    expect(compactSlots(host)).toEqual([0, 1, 2]);
    act(() => root.unmount());

    const restoredRoot = createRoot(host);
    act(() => restoredRoot.render(React.createElement(PersistedMagicSortHarness)));
    expect(compactSlots(host)).toEqual([0, 1, 2]);
    act(() => restoredRoot.unmount());
  });

  it("MCU-03 only moves a connected Bug into a free spacer slot", () => {
    const layout = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 102 }
      ],
      addSpacer: true,
      workItemIds: [201, 202, 203],
      workItemPositions: { 201: 0, 202: 4, 203: 5 },
      workItems: [
        { id: 201, relatedTestCaseIds: [102] },
        { id: 202, relatedTestCaseIds: [101] },
        { id: 203, relatedTestCaseIds: [] }
      ]
    }).steps.at(-1)!;

    expect(layout.workItemPositions?.[203]).toBe(0);
    expect(layout.workItemPositions?.[202]).toBe(1);
    expect(layout.workItemPositions?.[201]).toBe(2);
  });

  it("MCU-04 keeps dense Magic Sort unchanged while Add Spacer is disabled", () => {
    const layout = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101] }],
      workItemIds: [202, 201],
      workItems: [
        { id: 201, relatedTestCaseIds: [101] },
        { id: 202, relatedTestCaseIds: [] }
      ]
    }).steps.at(-1)!;

    expect(layout.workItemIds).toEqual([201, 202]);
    expect(layout.workItemPositions).toBeUndefined();
  });
});

function MagicSortHarness(props: {
  input: MagicSortInput;
  applyLayout(layout: MagicSortLayout): void;
}): React.ReactElement {
  const magicSort = useMagicSort(props);
  return React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort");
}

function compactUnlinkedInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [101] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 }
    ],
    addSpacer: true,
    workItemIds: [202, 203, 201],
    workItemPositions: { 201: 3, 202: 96, 203: 99 },
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [] },
      { id: 203, relatedTestCaseIds: [] }
    ]
  };
}

function PersistedMagicSortHarness(): React.ReactElement {
  const spacer = useMagicSortSpacerOption("compact-unlinked");
  const input = {
    ...compactUnlinkedInput(),
    workItemPositions: spacer.workItemPositions
  };
  const magicSort = useMagicSort({
    input,
    applyLayout(layout) {
      spacer.applyVisiblePositions(input.workItemIds, layout.workItemPositions ?? {});
    }
  });
  const positions = [202, 203, 201].map((id) => spacer.workItemPositions[id]).join(",");
  return React.createElement(React.Fragment, null,
    React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort"),
    React.createElement("output", null, positions)
  );
}

function compactSlots(host: HTMLElement): number[] {
  return (host.querySelector("output")?.textContent ?? "")
    .split(",")
    .map((value) => Number(value))
    .sort((left, right) => left - right);
}
