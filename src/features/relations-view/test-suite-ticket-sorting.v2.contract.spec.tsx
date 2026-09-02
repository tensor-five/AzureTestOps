// @vitest-environment jsdom
import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { userEvent } from "@testing-library/user-event";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { TestSuiteNode } from "../../domain/test-management/test-suite-tree.js";
import type { SuiteCollapseApi } from "./use-suite-collapse.js";
import type { TestCaseOrderApi } from "./use-test-case-order.js";
import { TestCaseColumn } from "./test-case-column.js";

const AUTH = 11;
const PERMISSIONS = 12;
const OPTIONS = [
  "Outcome · Aufsteigend",
  "Outcome · Absteigend",
  "Titel · Aufsteigend",
  "Titel · Absteigend"
] as const;

function tree(): TestSuiteNode {
  return {
    id: 1,
    name: "Release 2026.09",
    parentSuiteId: null,
    path: "Release 2026.09",
    children: [
      { id: AUTH, name: "Authentication", parentSuiteId: 1, path: "Release > Authentication", children: [] },
      { id: PERMISSIONS, name: "Permissions", parentSuiteId: 1, path: "Release > Permissions", children: [] }
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
    suitePath: `Release > ${suiteId}`,
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

function createManualOrder(initial: readonly number[]): {
  api: TestCaseOrderApi;
  set(ids: readonly number[]): void;
  move: ReturnType<typeof vi.fn>;
} {
  let stored = [...initial];
  const applyVisibleOrder = vi.fn((suiteId: number, _visible: readonly number[], next: readonly number[]) => {
    if (suiteId === AUTH) {
      stored = [...next];
    }
  });
  const move = vi.fn((suiteId: number, draggedId: number, targetId: number, edge: "before" | "after") => {
    if (suiteId !== AUTH) {
      return;
    }
    const withoutDragged = stored.filter((id) => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(targetId);
    withoutDragged.splice(targetIndex + (edge === "after" ? 1 : 0), 0, draggedId);
    stored = withoutDragged;
  });
  return {
    api: {
      sortByStoredOrder: (_suiteId, items) => items.slice().sort(
        (left, right) => stored.indexOf(left.workItemId) - stored.indexOf(right.workItemId)
      ),
      move,
      applyVisibleOrder
    },
    set: (ids) => { stored = [...ids]; },
    move
  };
}

function render(projections: readonly TestCaseProjection[], order: TestCaseOrderApi) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ui = <TestCaseColumn suiteTree={tree()} projections={projections} unfilteredCount={projections.length} collapse={collapse()} order={order} />;
  act(() => root.render(ui));
  return {
    container,
    rerender: () => act(() => root.render(ui)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function suite(container: HTMLElement, suiteId: number): HTMLElement {
  const node = container.querySelector<HTMLElement>(`.relations-view-suite:has([data-suite-id="${suiteId}"])`);
  expect(node, `Suite ${suiteId} muss sichtbar sein`).not.toBeNull();
  return node!;
}

function sortTrigger(container: HTMLElement, suiteId = AUTH): HTMLButtonElement {
  const header = suite(container, suiteId).querySelector<HTMLElement>(".relations-view-suite-header");
  const button = [...header!.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === "⇅");
  expect(button, "Die Suite muss einen zugänglichen Sortier-Symbolschalter besitzen").toBeDefined();
  return button!;
}

function menuItem(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button, `Das Sortiermenü muss „${label}“ enthalten`).toBeDefined();
  return button!;
}

function ids(container: HTMLElement, suiteId = AUTH): number[] {
  return [...suite(container, suiteId).querySelectorAll<HTMLElement>("[data-test-case-id]")]
    .map((row) => Number(row.dataset.testCaseId));
}

function accessibleOutcomes(container: HTMLElement): Map<number, string> {
  return new Map(
    [...suite(container, AUTH).querySelectorAll<HTMLElement>("[data-test-case-id]")]
      .map((row) => [
        Number(row.dataset.testCaseId),
        row.querySelector<HTMLElement>(".relations-view-outcome-chip")?.getAttribute("aria-label") ?? ""
      ])
  );
}

describe("Vertrag v2: Einmalige Sortierung von Tickets in Test Suites", () => {
  it("TSS2-01 zeigt im Kopfbereich nur einen dezenten Sortier-Symbolschalter", () => {
    const manual = createManualOrder([101, 201]);
    const harness = render([
      projection(101, AUTH, "Login", "Passed"),
      projection(201, PERMISSIONS, "Roles", "NotRun")
    ], manual.api);

    for (const suiteId of [AUTH, PERMISSIONS]) {
      const trigger = sortTrigger(harness.container, suiteId);
      expect(trigger.textContent?.trim()).toBe("⇅");
      expect(trigger.getAttribute("aria-label")?.trim().length).toBeGreaterThan(0);
      expect(suite(harness.container, suiteId).querySelector(".relations-view-suite-header")?.contains(trigger)).toBe(true);
    }
    const relationsStyles = readFileSync(
      fileURLToPath(new URL("../../app/bootstrap/local-ui-relations.css", import.meta.url)),
      "utf8"
    );
    expect(relationsStyles).toMatch(
      /\.relations-view-suite-focus,\s*\.relations-view-suite-link,\s*\.relations-view-suite-sort-trigger\s*\{[^}]*border:\s*1px solid transparent;[^}]*background:\s*transparent;/s
    );
    harness.unmount();
  });

  it("TSS2-02 öffnet über das Symbol genau die vier vereinbarten Optionen", () => {
    const manual = createManualOrder([101]);
    const harness = render([projection(101, AUTH, "Login", "Passed")], manual.api);

    act(() => sortTrigger(harness.container).click());

    const menu = menuItem(harness.container, OPTIONS[0]).parentElement!;
    expect([...menu.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.textContent?.trim()))
      .toEqual(OPTIONS);
    harness.unmount();
  });

  it("TSS2-03 sortiert nur die gewählte Suite einmal, schließt das Menü und übergibt die neue manuelle Reihenfolge", () => {
    const manual = createManualOrder([103, 101, 102, 201]);
    const harness = render([
      projection(103, AUTH, "Charlie", "Passed"),
      projection(101, AUTH, "Alpha", "Failed"),
      projection(102, AUTH, "Bravo", "NotRun"),
      projection(201, PERMISSIONS, "Roles", "Passed")
    ], manual.api);
    const permissions = ids(harness.container, PERMISSIONS);

    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());

    expect(ids(harness.container)).toEqual([101, 102, 103]);
    expect(ids(harness.container, PERMISSIONS)).toEqual(permissions);
    expect(harness.container.querySelector("[role='menu']")).toBeNull();
    harness.unmount();
  });

  it("TSS2-04 sortiert Titel und Outcomes ohne Beachtung der Groß- und Kleinschreibung", () => {
    const manual = createManualOrder([103, 101, 102]);
    const harness = render([
      projection(103, AUTH, "Payment – Zulu", "passed"),
      projection(101, AUTH, "payment – alpha", "PASSED"),
      projection(102, AUTH, "Profile – Banana", "blocked")
    ], manual.api);

    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    expect(ids(harness.container)).toEqual([101, 103, 102]);
    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Absteigend").click());
    expect(ids(harness.container)).toEqual([102, 103, 101]);
    const outcomes = accessibleOutcomes(harness.container);
    expect([...outcomes.values()].every((outcome) => outcome.length > 0)).toBe(true);
    const ascendingOutcomes = [...outcomes.keys()].sort((left, right) =>
      outcomes.get(left)!.toLocaleLowerCase().localeCompare(outcomes.get(right)!.toLocaleLowerCase())
    );
    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Outcome · Aufsteigend").click());
    expect(ids(harness.container)).toEqual(ascendingOutcomes);
    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Outcome · Absteigend").click());
    const descendingOutcomes = [...outcomes.keys()].sort((left, right) =>
      outcomes.get(right)!.toLocaleLowerCase().localeCompare(outcomes.get(left)!.toLocaleLowerCase())
    );
    expect(ids(harness.container)).toEqual(descendingOutcomes);
    harness.unmount();
  });

  it("TSS2-05 erhält bei gleichem Sortierwert die unmittelbar zuvor sichtbare Reihenfolge", () => {
    const manual = createManualOrder([103, 101, 102]);
    const harness = render([
      projection(103, AUTH, "alpha", "Passed"),
      projection(101, AUTH, "Alpha", "Failed"),
      projection(102, AUTH, "Bravo", "NotRun")
    ], manual.api);

    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());

    expect(ids(harness.container)).toEqual([103, 101, 102]);
    harness.unmount();
  });

  it("TSS2-05 erhält bei gleichen Outcomes die unmittelbar zuvor sichtbare Reihenfolge", () => {
    const manual = createManualOrder([103, 101, 102]);
    const harness = render([
      projection(103, AUTH, "Zulu", "passed"),
      projection(101, AUTH, "Alpha", "PASSED"),
      projection(102, AUTH, "Bravo", "blocked")
    ], manual.api);

    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    expect(ids(harness.container)).toEqual([101, 102, 103]);
    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Outcome · Aufsteigend").click());

    expect(ids(harness.container)).toEqual([102, 101, 103]);
    harness.unmount();
  });

  it("TSS2-06 überlässt die Suite nach dem Impuls vollständig der manuellen Reihenfolge", () => {
    const manual = createManualOrder([103, 101, 102]);
    const harness = render([
      projection(103, AUTH, "Charlie", "Passed"),
      projection(101, AUTH, "Alpha", "Failed"),
      projection(102, AUTH, "Bravo", "NotRun")
    ], manual.api);

    act(() => sortTrigger(harness.container).click());
    act(() => menuItem(harness.container, "Titel · Aufsteigend").click());
    const firstHandle = suite(harness.container, AUTH).querySelector<HTMLButtonElement>(
      '[data-test-case-id="101"] .relations-view-drag-handle'
    )!;
    act(() => firstHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(manual.move).toHaveBeenCalled();
    harness.rerender();

    expect(ids(harness.container)).toEqual([102, 101, 103]);
    act(() => sortTrigger(harness.container).click());
    expect(OPTIONS.map((label) => menuItem(harness.container, label).getAttribute("aria-checked")))
      .toEqual(["false", "false", "false", "false"]);
    harness.unmount();
  });

  it("TSS2-07 stellt die einmalig sortierte Reihenfolge über die bestehende manuelle Persistenz wieder her", () => {
    const manual = createManualOrder([103, 101, 102]);
    const projections = [
      projection(103, AUTH, "Charlie", "Passed"),
      projection(101, AUTH, "Alpha", "Failed"),
      projection(102, AUTH, "Bravo", "NotRun")
    ];
    const first = render(projections, manual.api);

    act(() => sortTrigger(first.container).click());
    act(() => menuItem(first.container, "Titel · Aufsteigend").click());
    first.unmount();
    const restored = render(projections, manual.api);

    expect(ids(restored.container)).toEqual([101, 102, 103]);
    restored.unmount();
  });

  it("TSS2-08 lässt das Symbol und jede Option per Tastatur bedienen", async () => {
    for (const [index, label] of OPTIONS.entries()) {
      const manual = createManualOrder([103, 101, 102]);
      const harness = render([
        projection(103, AUTH, "Charlie", "Passed"),
        projection(101, AUTH, "Alpha", "Failed"),
        projection(102, AUTH, "Bravo", "Blocked")
      ], manual.api);
      const user = userEvent.setup();
      const trigger = sortTrigger(harness.container);

      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      trigger.focus();
      await user.keyboard("{Enter}");
      for (let position = 0; position <= index; position += 1) {
        await user.tab();
      }
      expect(document.activeElement).toBe(menuItem(harness.container, label));
      await user.keyboard("{Enter}");
      expect(harness.container.querySelector("[role='menu']")).toBeNull();
      harness.unmount();
    }
  });
});
