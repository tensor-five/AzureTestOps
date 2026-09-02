// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";
import type { TestCaseOrderApi } from "./use-test-case-order.js";
import { TestCaseColumn } from "./test-case-column.js";

const SUITE_AUTHENTICATION = 11;
const SUITE_PERMISSIONS = 12;

function suiteTree(): TestSuiteNode {
  return {
    id: 1,
    name: "Release 2026.09",
    parentSuiteId: null,
    path: "Release 2026.09",
    children: [
      {
        id: SUITE_AUTHENTICATION,
        name: "Authentication",
        parentSuiteId: 1,
        path: "Release 2026.09 > Authentication",
        children: []
      },
      {
        id: SUITE_PERMISSIONS,
        name: "Permissions",
        parentSuiteId: 1,
        path: "Release 2026.09 > Permissions",
        children: []
      }
    ]
  };
}

function projection(
  workItemId: number,
  suiteId: number,
  title: string,
  lastOutcome: string
): TestCaseProjection {
  return {
    workItemId,
    suiteId,
    suitePath: `Release 2026.09 > Suite ${suiteId}`,
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
    lastOutcome,
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

function collapse(): SuiteCollapseApi {
  return {
    collapsedSuiteIds: new Set(),
    isCollapsed: () => false,
    toggle: () => undefined,
    collapseAll: () => undefined,
    expandAll: () => undefined
  };
}

function render(
  projections: readonly TestCaseProjection[],
  options: { order?: TestCaseOrderApi } = {}
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TestCaseColumn
        suiteTree={suiteTree()}
        projections={projections}
        unfilteredCount={projections.length}
        collapse={collapse()}
        order={options.order}
      />
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function storedOrder(ids: readonly number[]): TestCaseOrderApi {
  return {
    sortByStoredOrder: (_suiteId, items) => items.slice().sort(
      (left, right) => ids.indexOf(left.workItemId) - ids.indexOf(right.workItemId)
    ),
    move: () => undefined
  };
}

function suite(container: HTMLElement, suiteId: number): HTMLElement {
  const match = container.querySelector<HTMLElement>(
    `.relations-view-suite:has([data-suite-id="${suiteId}"])`
  );
  expect(match, `Test Suite ${suiteId} muss sichtbar sein`).not.toBeNull();
  return match!;
}

function sortButton(container: HTMLElement, suiteId: number): HTMLButtonElement {
  const header = suite(container, suiteId).querySelector<HTMLElement>(
    ".relations-view-suite-header"
  );
  expect(header, `Test Suite ${suiteId} muss einen Kopfbereich besitzen`).not.toBeNull();
  const match = [...header!.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.includes("Sortieren"));
  expect(match, `Test Suite ${suiteId} muss einen Sortieren-Button besitzen`).toBeDefined();
  return match!;
}

function menuItem(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === label);
  expect(match, `Sortiermenü muss „${label}“ anbieten`).toBeDefined();
  return match!;
}

function commonMenuContainer(options: readonly HTMLButtonElement[]): HTMLElement {
  const [first, ...rest] = options;
  const candidates: HTMLElement[] = [];
  let current: HTMLElement | null = first;
  while (current) {
    candidates.push(current);
    current = current.parentElement;
  }
  const menu = candidates.find((candidate) => rest.every((option) => candidate.contains(option)));
  expect(menu, "Die vier Sortieroptionen müssen ein gemeinsames Menü bilden").toBeDefined();
  return menu!;
}

function testCaseIds(container: HTMLElement, suiteId: number): number[] {
  return [...suite(container, suiteId).querySelectorAll<HTMLElement>("[data-test-case-id]")]
    .map((row) => Number(row.dataset.testCaseId));
}

function accessibleOutcomes(container: HTMLElement, suiteId: number): Map<number, string> {
  return new Map(
    [...suite(container, suiteId).querySelectorAll<HTMLElement>("[data-test-case-id]")]
      .map((row) => [
        Number(row.dataset.testCaseId),
        row.querySelector<HTMLElement>(".relations-view-outcome-chip")?.getAttribute("aria-label") ?? ""
      ])
  );
}

describe("Vertrag v1: Sortierung von Tickets in Test Suites", () => {
  it("TSS-01 zeigt in jeder befüllten, ausgeklappten Test Suite einen Sortieren-Button", () => {
    const harness = render([
      projection(101, SUITE_AUTHENTICATION, "Login", "Passed"),
      projection(201, SUITE_PERMISSIONS, "Roles", "NotRun")
    ]);

    expect(sortButton(harness.container, SUITE_AUTHENTICATION).textContent).toContain("Sortieren");
    expect(sortButton(harness.container, SUITE_PERMISSIONS).textContent).toContain("Sortieren");
    harness.unmount();
  });

  it("TSS-02 öffnet je Suite ein Menü mit genau den vier vereinbarten Sortieroptionen", () => {
    const harness = render([
      projection(101, SUITE_AUTHENTICATION, "Login", "Passed"),
      projection(201, SUITE_PERMISSIONS, "Roles", "NotRun")
    ]);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());

    const expectedOptions = [
      "Outcome · Aufsteigend",
      "Outcome · Absteigend",
      "Titel · Aufsteigend",
      "Titel · Absteigend"
    ];
    const options = expectedOptions.map((label) => menuItem(harness.container, label));
    expect([...commonMenuContainer(options).querySelectorAll<HTMLButtonElement>("button")]
      .map((button) => button.textContent?.trim())).toEqual(expectedOptions);
    harness.unmount();
  });

  it("TSS-03 ordnet nur die gewählte Test Suite unmittelbar um und belässt andere Suites unverändert", () => {
    const harness = render([
      projection(103, SUITE_AUTHENTICATION, "Charlie", "Passed"),
      projection(101, SUITE_AUTHENTICATION, "Alpha", "Failed"),
      projection(102, SUITE_AUTHENTICATION, "Bravo", "NotRun"),
      projection(201, SUITE_PERMISSIONS, "Zulu", "Passed"),
      projection(202, SUITE_PERMISSIONS, "Echo", "Failed")
    ]);
    const permissionOrder = testCaseIds(harness.container, SUITE_PERMISSIONS);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());

    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([101, 102, 103]);
    expect(testCaseIds(harness.container, SUITE_PERMISSIONS)).toEqual(permissionOrder);
    expect([...harness.container.querySelectorAll(".relations-view-suite-name")]
      .map((node) => node.textContent)).toEqual(["Release 2026.09", "Authentication", "Permissions"]);
    harness.unmount();
  });

  it("TSS-04 sortiert vollständige Titel ohne Beachtung der Groß- und Kleinschreibung auf- und absteigend", () => {
    const harness = render([
      projection(103, SUITE_AUTHENTICATION, "Payment – Zulu", "Passed"),
      projection(101, SUITE_AUTHENTICATION, "payment – alpha", "Failed"),
      projection(102, SUITE_AUTHENTICATION, "Profile – Banana", "NotRun")
    ]);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([101, 103, 102]);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Absteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([102, 103, 101]);
    harness.unmount();
  });

  it("TSS-05 sortiert angezeigte Outcome-Werte ohne Beachtung der Groß- und Kleinschreibung auf- und absteigend", () => {
    const harness = render([
      projection(101, SUITE_AUTHENTICATION, "Login", "passed"),
      projection(102, SUITE_AUTHENTICATION, "Reset", "BLOCKED"),
      projection(103, SUITE_AUTHENTICATION, "Guest", "Failed")
    ]);
    const outcomes = accessibleOutcomes(harness.container, SUITE_AUTHENTICATION);
    const expectedAscending = [...outcomes.keys()].sort((left, right) =>
      outcomes.get(left)!.toLocaleLowerCase().localeCompare(outcomes.get(right)!.toLocaleLowerCase())
    );

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Outcome · Aufsteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual(expectedAscending);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Outcome · Absteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual(expectedAscending.slice().reverse());
    harness.unmount();
  });

  it("TSS-06 erhält bei gleichen Titeln die zuvor sichtbare Reihenfolge", () => {
    const harness = render([
      projection(103, SUITE_AUTHENTICATION, "alpha", "Passed"),
      projection(101, SUITE_AUTHENTICATION, "Alpha", "Failed"),
      projection(102, SUITE_AUTHENTICATION, "Bravo", "NotRun")
    ], { order: storedOrder([103, 101, 102]) });

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());

    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([
      103,
      101,
      102
    ]);
    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Absteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([102, 103, 101]);
    harness.unmount();
  });

  it("TSS-06 erhält bei gleichen Outcomes die zuvor durch Titel-Sortierung sichtbare Reihenfolge", () => {
    const harness = render([
      projection(103, SUITE_AUTHENTICATION, "Zulu", "passed"),
      projection(101, SUITE_AUTHENTICATION, "Alpha", "PASSED"),
      projection(102, SUITE_AUTHENTICATION, "Bravo", "blocked")
    ]);

    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([101, 102, 103]);
    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Outcome · Aufsteigend").click());

    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([102, 101, 103]);
    harness.unmount();
  });

  it("TSS-07 behält die bestehende Reihenfolge bis zur Auswahl und markiert die gewählte Sortierung", () => {
    const harness = render([
      projection(103, SUITE_AUTHENTICATION, "Charlie", "Passed"),
      projection(101, SUITE_AUTHENTICATION, "Alpha", "Failed"),
      projection(102, SUITE_AUTHENTICATION, "Bravo", "NotRun")
    ], { order: storedOrder([103, 101, 102]) });

    expect(testCaseIds(harness.container, SUITE_AUTHENTICATION)).toEqual([103, 101, 102]);
    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    act(() => sortButton(harness.container, SUITE_AUTHENTICATION).click());

    expect(menuItem(harness.container, "Titel · Aufsteigend").getAttribute("aria-checked")).toBe("true");
    harness.unmount();
  });

  it("TSS-08 lässt den Sortieren-Button und die Optionen per Tastatur bedienen und vermittelt die aktive Option ohne Farbe", async () => {
    const harness = render([projection(101, SUITE_AUTHENTICATION, "Login", "Passed")]);
    const button = sortButton(harness.container, SUITE_AUTHENTICATION);
    const user = userEvent.setup();

    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    button.focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(document.activeElement).toBe(menuItem(harness.container, "Outcome · Aufsteigend"));
    await user.tab();
    expect(document.activeElement).toBe(menuItem(harness.container, "Outcome · Absteigend"));
    await user.tab();
    const option = menuItem(harness.container, "Titel · Aufsteigend");
    expect(document.activeElement).toBe(option);
    await user.tab();
    expect(document.activeElement).toBe(menuItem(harness.container, "Titel · Absteigend"));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(option);
    await user.keyboard("{Enter}");

    await user.click(button);
    expect(menuItem(harness.container, "Titel · Aufsteigend").getAttribute("aria-checked")).toBe("true");
    harness.unmount();
  });
});
