// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { TestCaseColumn } from "./test-case-column.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";
import type { TestCaseOrderApi } from "./use-test-case-order.js";

function tree(): TestSuiteNode {
  return {
    id: 1,
    name: "Root",
    parentSuiteId: null,
    path: "Root",
    children: [
      {
        id: 2,
        name: "API",
        parentSuiteId: 1,
        path: "Root > API",
        children: [
          {
            id: 3,
            name: "Auth",
            parentSuiteId: 2,
            path: "Root > API > Auth",
            children: []
          }
        ]
      },
      {
        id: 4,
        name: "UI",
        parentSuiteId: 1,
        path: "Root > UI",
        children: []
      }
    ]
  };
}

function projection(workItemId: number, suiteId: number, title: string): TestCaseProjection {
  return {
    workItemId,
    suiteId,
    suitePath: `Root > Suite ${suiteId}`,
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
    lastOutcome: "NotRun",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

function makeCollapse(collapsedIds: number[]): SuiteCollapseApi {
  const set = new Set(collapsedIds.map(String));
  return {
    collapsedSuiteIds: set,
    isCollapsed: (id) => set.has(String(id)),
    toggle: () => {}
  };
}

function render(ui: React.ReactElement): { container: HTMLDivElement; unmount(): void } {
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
    }
  };
}

describe("TestCaseColumn", () => {
  it("renders suite headers and groups projections under their suite", () => {
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[
          projection(101, 3, "Login fails on empty password"),
          projection(102, 3, "Login succeeds with valid creds"),
          projection(201, 4, "Header renders brand")
        ]}
        unfilteredCount={3}
        collapse={makeCollapse([])}
      />
    );

    const suites = harness.container.querySelectorAll(".relations-view-suite");
    expect(suites.length).toBe(4); // Root, API, Auth, UI

    const cards = harness.container.querySelectorAll(".relations-view-card-test-case");
    expect(cards.length).toBe(3);

    harness.unmount();
  });

  it("hides descendants of a collapsed suite", () => {
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[
          projection(101, 3, "Auth case"),
          projection(202, 4, "UI case")
        ]}
        unfilteredCount={2}
        collapse={makeCollapse([2])}
      />
    );

    const suiteNames = Array.from(
      harness.container.querySelectorAll(".relations-view-suite-name")
    ).map((node) => node.textContent);

    // Auth (child of API/2) is hidden because API is collapsed.
    expect(suiteNames).toEqual(["Root", "API", "UI"]);

    const cards = harness.container.querySelectorAll(".relations-view-card-test-case");
    expect(cards.length).toBe(1); // only the UI case is visible

    harness.unmount();
  });

  it("renders an empty state when there are no projections", () => {
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[]}
        unfilteredCount={0}
        collapse={makeCollapse([])}
      />
    );

    const empty = harness.container.querySelector(".relations-view-column-empty");
    expect(empty?.textContent).toContain("No test cases");

    harness.unmount();
  });
});

function buildDataTransferStub(): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    getData: (type: string) => data.get(type) ?? "",
    setDragImage: () => undefined,
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: () => undefined
  } as unknown as DataTransfer;
}

function fireDrag(
  target: HTMLElement,
  type: string,
  init: { dataTransfer: DataTransfer; clientY?: number }
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: init.dataTransfer,
    enumerable: true
  });
  Object.defineProperty(event, "clientY", {
    value: init.clientY ?? 0,
    enumerable: true
  });
  Object.defineProperty(event, "clientX", { value: 0, enumerable: true });
  target.dispatchEvent(event);
  return event;
}

function stubBounds(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON: () => ""
    }) as DOMRect;
}

describe("TestCaseColumn drag-and-drop reorder", () => {
  it("renders a drag handle next to each card when an order api is provided", () => {
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move: vi.fn()
    };

    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[
          projection(101, 3, "Auth A"),
          projection(102, 3, "Auth B"),
          projection(201, 4, "UI A")
        ]}
        unfilteredCount={3}
        collapse={makeCollapse([])}
        order={order}
      />
    );

    const handles = harness.container.querySelectorAll(".relations-view-drag-handle");
    expect(handles.length).toBe(3);

    harness.unmount();
  });

  it("reorders within the same suite by cursor Y vs. row midpoints", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };

    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[
          projection(101, 3, "Auth A"),
          projection(102, 3, "Auth B"),
          projection(103, 3, "Auth C")
        ]}
        unfilteredCount={3}
        collapse={makeCollapse([])}
        order={order}
      />
    );

    const suiteContainer = harness.container.querySelector<HTMLDivElement>(
      `[data-suite-id="3"]`
    )!;
    const rows = suiteContainer.querySelectorAll<HTMLElement>("[data-test-case-id]");
    expect(rows.length).toBe(3);
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    stubBounds(rows[2], 60, 30);

    const handle = rows[2].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    // Cursor at y=5: above row 0's midpoint (15) → drop before row 0.
    act(() => {
      fireDrag(suiteContainer, "dragover", { dataTransfer: dt, clientY: 5 });
    });
    expect(rows[0].getAttribute("data-drop-edge")).toBe("before");

    act(() => {
      fireDrag(suiteContainer, "drop", { dataTransfer: dt, clientY: 5 });
    });
    expect(move).toHaveBeenCalledWith(3, 103, 101, "before");

    harness.unmount();
  });

  it("rejects drops onto a different suite (cross-hierarchy moves are not allowed)", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };

    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[
          projection(101, 3, "Auth A"),
          projection(201, 4, "UI A")
        ]}
        unfilteredCount={2}
        collapse={makeCollapse([])}
        order={order}
      />
    );

    const suite3 = harness.container.querySelector<HTMLDivElement>(
      `[data-suite-id="3"]`
    )!;
    const suite4 = harness.container.querySelector<HTMLDivElement>(
      `[data-suite-id="4"]`
    )!;
    const rowSuite3 = suite3.querySelector<HTMLElement>("[data-test-case-id]")!;
    const rowSuite4 = suite4.querySelector<HTMLElement>("[data-test-case-id]")!;
    stubBounds(rowSuite4, 0, 30);

    const handle = rowSuite3.querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    // Drop attempt on a row that lives in suite 4 — different hierarchy level.
    const dropEvent = fireDrag(suite4, "drop", { dataTransfer: dt, clientY: 10 });

    expect(dropEvent.defaultPrevented).toBe(false);
    expect(move).not.toHaveBeenCalled();
    expect(rowSuite4.getAttribute("data-drop-edge")).toBeNull();

    harness.unmount();
  });
});
