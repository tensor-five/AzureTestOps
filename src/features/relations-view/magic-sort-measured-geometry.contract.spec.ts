// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planMagicSort, type MagicSortInput, type MagicSortLayout } from "./magic-sort-layout.js";
import { captureMagicSortGeometry } from "./magic-sort-geometry.js";
import { useMagicSort } from "./use-magic-sort.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Magic Sort measured geometry contract v1", () => {
  it("MMG-01 and MMG-04 capture visible card centers afresh when Magic Sort starts", () => {
    const fixture = geometryFixture();
    const first = captureMagicSortGeometry(fixture.input);
    fixture.setTop("work-item-201", 120);
    const second = captureMagicSortGeometry(fixture.input);

    expect(first.measuredWorkItemSlotCenters).toEqual([230, 308, 415]);
    expect(second.measuredWorkItemSlotCenters).toEqual([150, 308, 415]);
    expect(first.measuredTestCaseSlotCenters).toHaveLength(3);
  });

  it("MMG-01 takes a new DOM snapshot for each separate Magic Sort click", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const fixture = geometryFixture();
    const applyLayout = vi.fn<(layout: MagicSortLayout) => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const captureGeometry = vi.fn(() => captureMagicSortGeometry(fixture.input));

    act(() => root.render(React.createElement(MagicSortHarness, {
      input: sortableInput(), applyLayout, captureGeometry
    })));
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    fixture.setTop("work-item-201", 120);
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());

    expect(captureGeometry).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it("MMG-04 waits for a Magic Sort click after filter, collapse, and resize changes", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const applyLayout = vi.fn<(layout: MagicSortLayout) => void>();
    const captureGeometry = vi.fn(() => ({
      measuredTestCaseSlotCenters: [10, 20],
      measuredWorkItemSlotCenters: [20, 10]
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const input = sortableInput();

    act(() => root.render(React.createElement(MagicSortHarness, { input, applyLayout, captureGeometry })));
    act(() => root.render(React.createElement(MagicSortHarness, {
      input: { ...input, visibleRows: input.visibleRows?.slice(1) },
      applyLayout,
      captureGeometry
    })));
    act(() => globalThis.dispatchEvent(new Event("resize")));

    expect(captureGeometry).not.toHaveBeenCalled();
    expect(applyLayout).not.toHaveBeenCalled();

    act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    expect(captureGeometry).toHaveBeenCalledTimes(1);
    expect(applyLayout).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("MMG-02 minimizes measured card-center distances instead of list indices", () => {
    const plan = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 102 }
      ],
      workItemIds: [201, 202],
      workItems: [{ id: 201, relatedTestCaseIds: [101] }, { id: 202, relatedTestCaseIds: [102] }],
      measuredTestCaseSlotCenters: [20, 90, 250],
      measuredWorkItemSlotCenters: [250, 90]
    } as MagicSortInput);

    expect(plan.steps.at(-1)?.workItemIds).toEqual([202, 201]);
  });

  it("MMG-05 keeps the current discrete optimization as a fallback without a measurement", () => {
    const plan = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 102 }
      ],
      workItemIds: [201, 202],
      workItems: [{ id: 201, relatedTestCaseIds: [102] }, { id: 202, relatedTestCaseIds: [101] }]
    });

    expect(plan.steps.at(-1)?.workItemIds).toEqual([202, 201]);
  });

  it("MMG-03 measures suite headers and each active free Bug slot", () => {
    const fixture = geometryFixture();

    expect(captureMagicSortGeometry(fixture.input)).toEqual({
      measuredTestCaseSlotCenters: [35, 105, 160],
      measuredWorkItemSlotCenters: [230, 308, 415]
    });
  });
});

function geometryFixture(): {
  input: Parameters<typeof captureMagicSortGeometry>[0];
  setTop(name: string, top: number): void;
} {
  const container = document.createElement("section");
  document.body.append(container);
  const elements = new Map<string, HTMLElement>();
  const add = (name: string, element: HTMLElement, top: number, height: number) => {
    element.dataset.geometryName = name;
    container.append(element);
    elements.set(name, element);
    setRect(element, top, height);
  };
  setRect(container, 0);

  const suite = document.createElement("div");
  suite.className = "relations-view-suite-header";
  const suiteButton = document.createElement("button");
  suiteButton.dataset.suiteId = "11";
  suite.append(suiteButton);
  add("suite", suite, 20, 30);
  const firstTestCase = document.createElement("div");
  firstTestCase.dataset.testCaseId = "101";
  add("test-case-101", firstTestCase, 80, 50);
  const secondTestCase = document.createElement("div");
  secondTestCase.dataset.testCaseId = "102";
  add("test-case-102", secondTestCase, 140, 40);
  const filteredTestCase = document.createElement("div");
  filteredTestCase.dataset.testCaseId = "999";
  add("test-case-999", filteredTestCase, 500, 70);

  const list = document.createElement("ol");
  list.className = "relations-view-work-item-list";
  container.append(list);
  ["work-item-201", "spacer", "work-item-202"].forEach((name, index) => {
    const slot = document.createElement("li");
    if (name === "spacer") {
      slot.dataset.workItemSpacer = "";
    } else {
      slot.dataset.workItemId = name.slice(-3);
    }
    list.append(slot);
    elements.set(name, slot);
    setRect(slot, 200 + index * 100, [60, 16, 30][index]!);
  });

  return {
    input: {
      container,
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 102 }
      ],
      workItemIds: [201, 202]
    },
    setTop(name, top) {
      const height = name === "work-item-201" ? 60 : 20;
      setRect(elements.get(name)!, top, height);
    }
  };
}

function setRect(element: HTMLElement, top: number, height = 20): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top, height })
  });
}

function MagicSortHarness(props: {
  input: MagicSortInput;
  applyLayout(layout: MagicSortLayout): void;
  captureGeometry(): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">;
}): React.ReactElement {
  const magicSort = useMagicSort(props);
  return React.createElement("button", { type: "button", onClick: magicSort.start }, "Magic Sort");
}

function sortableInput(): MagicSortInput {
  return {
    suites: [{ suiteId: 11, testCaseIds: [101] }],
    visibleRows: [
      { kind: "suite-header", suiteId: 11 },
      { kind: "test-case", suiteId: 11, testCaseId: 101 }
    ],
    workItemIds: [201, 202],
    workItems: [
      { id: 201, relatedTestCaseIds: [101] },
      { id: 202, relatedTestCaseIds: [] }
    ]
  };
}
