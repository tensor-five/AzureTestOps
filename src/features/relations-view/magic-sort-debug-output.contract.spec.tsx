// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planMagicSort, type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { useMagicSort } from "./use-magic-sort.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Magic-Sort-Debug-Output contract v1", () => {
  it("MSDO-01 emits no debug report without the exact magicSortDebug=1 query value", () => {
    const absent = renderHarness("", baseInput(), () => ({}));
    act(() => absent.host.querySelector("button")?.click());
    expect(absent.consoleInfo).not.toHaveBeenCalled();
    absent.unmount();

    const disabled = renderHarness("?magicSortDebug=0", baseInput(), () => ({}));
    act(() => disabled.host.querySelector("button")?.click());
    expect(disabled.consoleInfo).not.toHaveBeenCalled();
    disabled.unmount();

    const otherValue = renderHarness("?magicSortDebug=true", baseInput(), () => ({}));
    act(() => otherValue.host.querySelector("button")?.click());
    expect(otherValue.consoleInfo).not.toHaveBeenCalled();
    otherValue.unmount();

    const enabled = renderHarness("?magicSortDebug=1", baseInput(), () => ({}));
    act(() => enabled.host.querySelector("button")?.click());
    expect(enabled.consoleInfo).toHaveBeenCalledTimes(1);
    enabled.unmount();
  });

  it("MSDO-02 and MSDO-04 emit one copyable JSON report even when no layout changes or geometry is unavailable", () => {
    const harness = renderHarness("?magicSortDebug=1", baseInput(), () => ({}));
    act(() => harness.host.querySelector("button")?.click());

    const report = readReport(harness.consoleInfo);
    expect(report.schema).toBe("magic-sort-debug.v1");
    expect(report.run).toBe(1);
    expect(report.geometry).toMatchObject({ state: "fallback", reason: expect.any(String) });
    expect(report.summary).toMatchObject({ acceptedImprovements: 0 });
    expect(JSON.stringify(report)).not.toContain("token");
    harness.unmount();
  });

  it("MSDO-03 reports visible IDs, relations, measured centres, slots, per-relation decisions and optimization summary", () => {
    const input = {
      ...baseInput(),
      workItems: [
        ...baseInput().workItems,
        { id: 203, relatedTestCaseIds: [999] }
      ]
    };
    const harness = renderHarness("?magicSortDebug=1", input, () => ({
      measuredTestCaseSlotCenters: [15, 50, 110],
      measuredWorkItemSlotCenters: [50, 110, 170]
    }));
    act(() => harness.host.querySelector("button")?.click());

    const report = readReport(harness.consoleInfo);
    expect(report.visible).toEqual({ testCaseIds: [101, 102], workItemIds: [201, 202] });
    expect(report.relations).toEqual([{ testCaseId: 101, workItemId: 201 }, { testCaseId: 102, workItemId: 202 }]);
    expect(report.geometry.testCaseCenters).toEqual([15, 50, 110]);
    expect(report.geometry.workItemSlotCenters).toEqual([50, 110, 170]);
    expect(report.geometry.workItemSlotHeight).toBe(60);
    expect(report.search).toMatchObject({ slotRange: { from: 0, to: 2 } });
    expect(report.relationDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ testCaseId: 101, workItemId: 201, initialSlot: expect.any(Number), finalSlot: expect.any(Number), decision: expect.any(String) })
    ]));
    expect(report.summary).toMatchObject({ crossings: expect.any(Number), totalDistance: expect.any(Number), acceptedImprovements: expect.any(Number) });
    expect(JSON.stringify(report)).not.toContain("203");
    harness.unmount();
  });

  it("MSDO-05 captures fresh geometry and produces one report for each explicit click only", () => {
    const geometry = vi.fn()
      .mockReturnValueOnce({ measuredTestCaseSlotCenters: [0, 50, 100], measuredWorkItemSlotCenters: [50, 100] })
      .mockReturnValueOnce({ measuredTestCaseSlotCenters: [0, 75, 150], measuredWorkItemSlotCenters: [75, 150] });
    const harness = renderHarness("?magicSortDebug=1", baseInput(), geometry);

    expect(harness.consoleInfo).not.toHaveBeenCalled();
    act(() => harness.host.querySelector("button")?.click());
    act(() => harness.host.querySelector("button")?.click());

    expect(geometry).toHaveBeenCalledTimes(2);
    expect(harness.consoleInfo).toHaveBeenCalledTimes(2);
    expect(readReport(harness.consoleInfo, 0).geometry.testCaseCenters).toEqual([0, 50, 100]);
    expect(readReport(harness.consoleInfo, 1).geometry.testCaseCenters).toEqual([0, 75, 150]);
    harness.unmount();
  });

  it("MSDO-05 does not report for filter, collapse or resize events without a Magic Sort click", () => {
    const harness = renderHarness("?magicSortDebug=1", baseInput(), () => ({}));
    act(() => {
      globalThis.dispatchEvent(new Event("resize"));
      globalThis.dispatchEvent(new Event("magic-sort-filter-change"));
      globalThis.dispatchEvent(new Event("magic-sort-collapse-change"));
    });
    expect(harness.consoleInfo).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("MSDO-04 keeps the report local without storage writes or external requests", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const localStorageSetItem = vi.spyOn(Storage.prototype, "setItem");
    const sessionStorageSetItem = vi.spyOn(Storage.prototype, "setItem");
    const harness = renderHarness("?magicSortDebug=1", baseInput(), () => ({}));
    localStorageSetItem.mockClear();
    sessionStorageSetItem.mockClear();

    act(() => harness.host.querySelector("button")?.click());

    expect(fetch).not.toHaveBeenCalled();
    expect(localStorageSetItem).not.toHaveBeenCalled();
    expect(sessionStorageSetItem).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("MSDO-06 observes the normal Magic Sort plan without changing its resulting layout", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const input = {
      ...baseInput(),
      workItems: [{ id: 201, relatedTestCaseIds: [102] }, { id: 202, relatedTestCaseIds: [101] }]
    };
    const expected = planMagicSort(input).steps.at(-1)!;
    const harness = renderHarness("?magicSortDebug=1", input, () => ({}));
    act(() => harness.host.querySelector("button")?.click());

    expect(harness.applied.at(-1)).toEqual(expected);
    harness.unmount();
  });
});

function renderHarness(
  search: string,
  input: MagicSortInput,
  captureGeometry: () => Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">
): {
  host: HTMLDivElement;
  applied: MagicSortLayout[];
  consoleInfo: ReturnType<typeof vi.spyOn>;
  unmount(): void;
} {
  history.replaceState({}, "", `/${search}`);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const applied: MagicSortLayout[] = [];
  const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
  act(() => root.render(React.createElement(MagicSortHarness, { input, captureGeometry, applyLayout: (layout) => applied.push(layout) })));
  return {
    host,
    applied,
    consoleInfo,
    unmount() {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function MagicSortHarness(props: {
  input: MagicSortInput;
  captureGeometry(): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">;
  applyLayout(layout: MagicSortLayout): void;
}): React.ReactElement {
  const magicSort = useMagicSort(props);
  return React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort");
}

function readReport(consoleInfo: ReturnType<typeof vi.spyOn>, call = 0): Record<string, any> {
  const [label, json] = consoleInfo.mock.calls[call] ?? [];
  expect(label).toBe("[magic-sort-debug.v1]");
  expect(typeof json).toBe("string");
  return JSON.parse(json as string) as Record<string, any>;
}

function baseInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 },
      { kind: "test-case", suiteId: 11, testCaseId: 102 }
    ],
    workItemIds: [201, 202],
    workItems: [{ id: 201, relatedTestCaseIds: [101] }, { id: 202, relatedTestCaseIds: [102] }]
  };
}
