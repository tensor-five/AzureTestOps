// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

import { TestCaseColumn } from "./test-case-column.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { ItemPositioningApi } from "./use-item-positioning.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";

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

function makePositioning(): ItemPositioningApi {
  return {
    positions: {},
    enabled: false,
    getOffset: () => ({ x: 0, y: 0 }),
    isDragging: () => false,
    startDrag: () => {},
    resetItem: () => {}
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
        positioning={makePositioning()}
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
        positioning={makePositioning()}
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
        positioning={makePositioning()}
        collapse={makeCollapse([])}
      />
    );

    const empty = harness.container.querySelector(".relations-view-column-empty");
    expect(empty?.textContent).toContain("No test cases");

    harness.unmount();
  });
});
