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
    toggle: () => {},
    collapseAll: () => {},
    expandAll: () => {}
  };
}

function render(ui: React.ReactElement): {
  container: HTMLDivElement;
  rerender(next: React.ReactElement): void;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender: (next) => {
      act(() => {
        root.render(next);
      });
    },
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

  it("allows a populated leaf suite to toggle its persisted collapsed state", () => {
    const toggle = vi.fn();
    const collapse: SuiteCollapseApi = {
      ...makeCollapse([3]),
      toggle
    };
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth case")]}
        unfilteredCount={1}
        collapse={collapse}
      />
    );
    const leafToggle = harness.container.querySelector<HTMLButtonElement>(
      '.relations-view-suite-toggle[data-suite-id="3"]'
    )!;

    expect(leafToggle.getAttribute("aria-expanded")).toBe("false");
    expect(harness.container.querySelector('[data-suite-cards][data-suite-id="3"]')).toBeNull();
    act(() => leafToggle.click());
    expect(toggle).toHaveBeenCalledWith(3);

    harness.unmount();
  });

  it("collapses branches, root and populated leaves while skipping empty leaves", () => {
    const collapseAll = vi.fn();
    const collapse: SuiteCollapseApi = {
      ...makeCollapse([]),
      collapseAll
    };
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth case")]}
        unfilteredCount={1}
        collapse={collapse}
      />
    );

    const collapseButton = [...harness.container.querySelectorAll<HTMLButtonElement>(
      ".relations-view-suite-toolbar button"
    )].find((button) => button.textContent === "Collapse all")!;
    act(() => collapseButton.click());

    expect(collapseAll).toHaveBeenCalledWith([1, 2, 3]);
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

  it("renders a suite results link next to every visible suite name", () => {
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth case")]}
        unfilteredCount={1}
        collapse={makeCollapse([])}
        getSuiteHref={(suiteId) =>
          `https://dev.azure.com/contoso/delivery/_testPlans/execute?view=_TestManagement&planId=9&suiteId=${suiteId}`}
      />
    );

    const links = harness.container.querySelectorAll<HTMLAnchorElement>(
      ".relations-view-suite-link"
    );
    expect(links.length).toBe(4);
    expect(links[2].getAttribute("href")).toBe(
      "https://dev.azure.com/contoso/delivery/_testPlans/execute?view=_TestManagement&planId=9&suiteId=3"
    );
    expect(links[2].getAttribute("aria-label")).toContain("suite Auth");

    harness.unmount();
  });

  it("hides empty branches while retaining the populated suite hierarchy", () => {
    const authCase = projection(101, 3, "Auth case");
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[authCase]}
        allProjections={[authCase]}
        unfilteredCount={1}
        collapse={makeCollapse([])}
        hideEmptySuites
      />
    );

    const suiteNames = [...harness.container.querySelectorAll(".relations-view-suite-name")]
      .map((node) => node.textContent);
    expect(suiteNames).toEqual(["Root", "API", "Auth"]);
    harness.unmount();
  });

  it("reveals collapsed search matches, highlights them and supports suite focus", () => {
    const onFocusSuite = vi.fn();
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth login") ]}
        unfilteredCount={1}
        collapse={makeCollapse([2])}
        searchQuery="auth"
        onFocusSuite={onFocusSuite}
      />
    );

    expect(harness.container.querySelector("mark")?.textContent).toBe("Auth");
    const focusButton = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Focus suite Auth"]'
    )!;
    act(() => focusButton.click());
    expect(onFocusSuite).toHaveBeenCalledWith(3);
    expect(harness.container.querySelectorAll(".relations-view-card-test-case")).toHaveLength(1);
    harness.unmount();
  });

  it("focuses a populated suite branch including descendant suites", () => {
    const onFocusSuite = vi.fn();
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth case")]}
        unfilteredCount={1}
        collapse={makeCollapse([])}
        focusedSuiteId={1}
        focusedSuiteIds={new Set([1, 2, 3])}
        onFocusSuite={onFocusSuite}
      />
    );

    const rootFocus = harness.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear focus from suite Root"]'
    )!;
    expect(rootFocus).not.toBeNull();
    expect(
      harness.container.querySelector('.relations-view-suite[data-suite-depth="2"]')
        ?.classList.contains("relations-view-suite-dimmed")
    ).toBe(false);
    act(() => rootFocus.click());
    expect(onFocusSuite).toHaveBeenCalledWith(null);

    harness.unmount();
  });

  it("invokes explorer controls and exposes keyboard tree navigation", () => {
    const collapseAll = vi.fn();
    const expandAll = vi.fn();
    const onHideEmptySuitesChange = vi.fn();
    const collapse = { ...makeCollapse([]), collapseAll, expandAll };
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[projection(101, 3, "Auth case")]}
        unfilteredCount={1}
        collapse={collapse}
        onHideEmptySuitesChange={onHideEmptySuitesChange}
      />
    );

    const buttons = [...harness.container.querySelectorAll<HTMLButtonElement>(
      ".relations-view-suite-toolbar button"
    )];
    act(() => buttons[0].click());
    act(() => buttons[1].click());
    expect(expandAll).toHaveBeenCalledTimes(1);
    expect(collapseAll).toHaveBeenCalledWith([1, 2, 3]);

    const checkbox = harness.container.querySelector<HTMLInputElement>(
      ".relations-view-suite-hide-empty input"
    )!;
    act(() => checkbox.click());
    expect(onHideEmptySuitesChange).toHaveBeenCalledWith(true);

    const treeButtons = harness.container.querySelectorAll<HTMLButtonElement>(
      ".relations-view-suite-toggle"
    );
    expect(harness.container.querySelector('[role="tree"]')).toBeNull();
    expect(harness.container.querySelector('[role="treeitem"]')).toBeNull();
    expect(treeButtons[0].getAttribute("aria-expanded")).toBe("true");
    treeButtons[0].focus();
    act(() => treeButtons[0].dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true
    })));
    expect(document.activeElement).toBe(treeButtons[1]);
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
      `[data-suite-cards][data-suite-id="3"]`
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
    expect(move).toHaveBeenCalledWith(3, 103, 101, "before", [101, 102, 103]);

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
      `[data-suite-cards][data-suite-id="3"]`
    )!;
    const suite4 = harness.container.querySelector<HTMLDivElement>(
      `[data-suite-cards][data-suite-id="4"]`
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

  it("uses the last preview target and retains filtered-out cases in the suite order", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };
    const allProjections = Array.from({ length: 8 }, (_, index) =>
      projection(index + 1, 3, `Case ${index + 1}`)
    );

    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[allProjections[1], allProjections[7]]}
        allProjections={allProjections}
        unfilteredCount={8}
        collapse={makeCollapse([])}
        order={order}
      />
    );

    const suiteContainer = harness.container.querySelector<HTMLDivElement>(
      `[data-suite-cards][data-suite-id="3"]`
    )!;
    const rows = suiteContainer.querySelectorAll<HTMLElement>("[data-test-case-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const handle = rows[0].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
      fireDrag(suiteContainer, "dragover", { dataTransfer: dt, clientY: 100 });
    });
    expect(rows[1].getAttribute("data-drop-edge")).toBe("after");

    act(() => {
      fireDrag(suiteContainer, "drop", { dataTransfer: dt, clientY: 0 });
    });
    expect(move).toHaveBeenCalledWith(3, 2, 8, "after", [1, 2, 3, 4, 5, 6, 7, 8]);

    harness.unmount();
  });

  it("keeps an after target on the lower half of a filtered visible test case", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };
    const allProjections = Array.from({ length: 8 }, (_, index) =>
      projection(index + 1, 3, `Case ${index + 1}`)
    );
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[allProjections[1], allProjections[7]]}
        allProjections={allProjections}
        unfilteredCount={8}
        collapse={makeCollapse([])}
        order={order}
      />
    );
    const suiteContainer = harness.container.querySelector<HTMLDivElement>(
      '[data-suite-cards][data-suite-id="3"]'
    )!;
    const rows = suiteContainer.querySelectorAll<HTMLElement>("[data-test-case-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(rows[1].querySelector<HTMLElement>(".relations-view-drag-handle")!, "dragstart", {
        dataTransfer: dt
      });
      fireDrag(suiteContainer, "dragover", { dataTransfer: dt, clientY: 25 });
      fireDrag(suiteContainer, "drop", { dataTransfer: dt, clientY: 25 });
    });

    expect(move).toHaveBeenCalledWith(3, 8, 2, "after", [1, 2, 3, 4, 5, 6, 7, 8]);
    harness.unmount();
  });

  it("invalidates the preview when its suite is collapsed before drop", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };
    const projections = [projection(1, 3, "Case 1"), projection(2, 3, "Case 2")];
    const renderColumn = (collapsed: number[]) => (
      <TestCaseColumn
        suiteTree={tree()}
        projections={projections}
        allProjections={projections}
        unfilteredCount={2}
        collapse={makeCollapse(collapsed)}
        order={order}
      />
    );
    const harness = render(renderColumn([]));
    const initialContainer = harness.container.querySelector<HTMLDivElement>(
      '[data-suite-cards][data-suite-id="3"]'
    )!;
    const rows = initialContainer.querySelectorAll<HTMLElement>("[data-test-case-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(rows[0].querySelector<HTMLElement>(".relations-view-drag-handle")!, "dragstart", {
        dataTransfer: dt
      });
      fireDrag(initialContainer, "dragover", { dataTransfer: dt, clientY: 55 });
    });
    expect(rows[1].getAttribute("data-drop-edge")).toBe("after");

    harness.rerender(renderColumn([3]));
    harness.rerender(renderColumn([]));
    const currentContainer = harness.container.querySelector<HTMLDivElement>(
      '[data-suite-cards][data-suite-id="3"]'
    )!;
    act(() => {
      fireDrag(currentContainer, "drop", { dataTransfer: dt });
    });

    expect(move).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("rejects a preview target removed from the latest suite snapshot", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };
    const visible = [projection(1, 3, "Case 1"), projection(2, 3, "Case 2")];
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={visible}
        allProjections={visible}
        unfilteredCount={2}
        collapse={makeCollapse([])}
        order={order}
      />
    );
    const suiteContainer = harness.container.querySelector<HTMLDivElement>(
      '[data-suite-cards][data-suite-id="3"]'
    )!;
    const rows = suiteContainer.querySelectorAll<HTMLElement>("[data-test-case-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const dt = buildDataTransferStub();
    act(() => {
      fireDrag(rows[0].querySelector<HTMLElement>(".relations-view-drag-handle")!, "dragstart", {
        dataTransfer: dt
      });
      fireDrag(suiteContainer, "dragover", { dataTransfer: dt, clientY: 55 });
    });

    harness.rerender(
      <TestCaseColumn
        suiteTree={tree()}
        projections={visible}
        allProjections={[visible[0]]}
        unfilteredCount={1}
        collapse={makeCollapse([])}
        order={order}
      />
    );
    const currentContainer = harness.container.querySelector<HTMLDivElement>(
      '[data-suite-cards][data-suite-id="3"]'
    )!;
    act(() => {
      fireDrag(currentContainer, "drop", { dataTransfer: dt });
    });

    expect(move).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("supports ArrowUp and ArrowDown within the current suite", () => {
    const move = vi.fn();
    const order: TestCaseOrderApi = {
      sortByStoredOrder: (_suiteId, items) => items.slice(),
      move
    };
    const allProjections = Array.from({ length: 8 }, (_, index) =>
      projection(index + 1, 3, `Case ${index + 1}`)
    );
    const harness = render(
      <TestCaseColumn
        suiteTree={tree()}
        projections={[allProjections[1], allProjections[7]]}
        allProjections={allProjections}
        unfilteredCount={8}
        collapse={makeCollapse([])}
        order={order}
      />
    );
    const handle = harness.container.querySelector<HTMLButtonElement>(
      '[data-test-case-id="8"] .relations-view-drag-handle'
    )!;

    handle.focus();
    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });

    expect(move).toHaveBeenCalledWith(3, 8, 2, "before", [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(handle.getAttribute("aria-keyshortcuts")).toBe("ArrowUp ArrowDown");
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(handle);
    expect(harness.container.querySelector('[role="status"]')?.textContent).toContain(
      "Moved test case #8 before test case #2"
    );

    harness.unmount();
  });
});
