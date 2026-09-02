// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import { TestCaseCard } from "../relations-view/test-case-card.js";
import { WorkItemCard } from "../relations-view/work-item-card.js";
import { filterOpenBugs } from "../relations-view/relations-view-controls.js";
import { filterTestCases } from "./test-case-filters.js";
import { filterWorkItems } from "./work-item-filters.js";

function bug(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1842,
    workItemType: "Bug",
    title: "Anmeldung schlägt nach Zeitüberschreitung fehl",
    state: "Active",
    assignedTo: null,
    tags: ["regression"],
    areaPath: null,
    priority: 2,
    relatedIds: [],
    ...over
  };
}

function testCase(over: Partial<TestCaseProjection> = {}): TestCaseProjection {
  return {
    workItemId: 1842,
    suiteId: 7,
    suitePath: "Root > Anmeldung",
    title: "Anmeldung mit gültigen Zugangsdaten",
    state: "Active",
    workItemType: "Test Case",
    assignedTo: null,
    tags: ["regression"],
    areaPath: null,
    priority: 2,
    relatedIds: [],
    testPointId: null,
    configurationId: null,
    configurationName: null,
    lastOutcome: "Passed",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null,
    ...over
  };
}

function render(ui: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return container;
}

describe("Vertrag IDS-01 bis IDS-07: Suche nach Work-Item-IDs", () => {
  it("IDS-01 und IDS-03 finden einen Bug über seine vollständige ID mit oder ohne führendes #", () => {
    const matching = bug({ id: 1842, title: "Unabhängiger Titel" });
    const other = bug({ id: 1843, title: "Anderer Bug" });

    expect(filterWorkItems([matching, other], { titleQuery: "1842" })).toEqual([matching]);
    expect(filterWorkItems([matching, other], { titleQuery: "#1842" })).toEqual([matching]);
  });

  it("IDS-02 und IDS-03 finden einen Test Case über seine vollständige ID mit oder ohne führendes #", () => {
    const matching = testCase({ workItemId: 1842, title: "Unabhängiger Titel", suitePath: "Root > Andere Suite" });
    const other = testCase({ workItemId: 1843, title: "Anderer Test", suitePath: "Root > Weitere Suite" });

    expect(filterTestCases([matching, other], { titleQuery: "1842" })).toEqual([matching]);
    expect(filterTestCases([matching, other], { titleQuery: "#1842" })).toEqual([matching]);
  });

  it("IDS-02 behält die getrennte Suche nach Test-Case-Titel und Suite-Pfad bei", () => {
    const titleMatch = testCase({ workItemId: 1901, title: "Anmeldung prüfen", suitePath: "Root > Regression" });
    const suiteMatch = testCase({ workItemId: 1902, title: "Unabhängiger Titel", suitePath: "Root > Anmeldung" });
    const other = testCase({ workItemId: 1903, title: "Export", suitePath: "Root > Export" });

    expect(filterTestCases([titleMatch, suiteMatch, other], { titleQuery: "prüfen" })).toEqual([titleMatch]);
    expect(filterTestCases([titleMatch, suiteMatch, other], { titleQuery: "anmeldung" })).toEqual([titleMatch, suiteMatch]);
  });

  it("IDS-03 findet weder Teil-IDs noch IDs, die die vollständige ID nur enthalten", () => {
    const exactBug = bug({ id: 1842, title: "Unabhängiger Titel" });
    const containingBug = bug({ id: 11842, title: "Anderer Titel" });
    const exactTestCase = testCase({ workItemId: 1842, title: "Unabhängiger Titel" });
    const containingTestCase = testCase({ workItemId: 11842, title: "Anderer Test" });

    expect(filterWorkItems([exactBug, containingBug], { titleQuery: "1842" })).toEqual([exactBug]);
    expect(filterTestCases([exactTestCase, containingTestCase], { titleQuery: "1842" })).toEqual([exactTestCase]);
    expect(filterWorkItems([exactBug, containingBug], { titleQuery: "184" })).toEqual([]);
    expect(filterTestCases([exactTestCase, containingTestCase], { titleQuery: "184" })).toEqual([]);
  });

  it("IDS-04 hebt eine per ID gefundene Bug- und Test-Case-ID auf der Karte hervor", () => {
    const container = render(<><WorkItemCard workItem={bug()} highlightQuery="#1842" /><TestCaseCard projection={testCase()} highlightQuery="1842" /></>);

    expect(container.querySelectorAll(".relations-view-card-id mark")).toHaveLength(2);
    expect(container.querySelector(".relations-view-card-work-item .relations-view-card-id mark")?.textContent).toBe("#1842");
    expect(container.querySelector(".relations-view-card-test-case .relations-view-card-id mark")?.textContent).toBe("1842");
  });

  it("IDS-04 behält die bestehende Hervorhebung in Bug- und Test-Case-Titeln bei", () => {
    const container = render(<><WorkItemCard workItem={bug()} highlightQuery="Anmeldung" /><TestCaseCard projection={testCase()} highlightQuery="Anmeldung" /></>);

    expect(container.querySelector(".relations-view-card-work-item .relations-view-card-title mark")?.textContent).toBe("Anmeldung");
    expect(container.querySelector(".relations-view-card-test-case .relations-view-card-title mark")?.textContent).toBe("Anmeldung");
  });

  it("IDS-05 kombiniert die ID-Suche weiterhin mit den bestehenden Facetten", () => {
    const active = bug({ id: 1842, state: "Active" });
    const closed = bug({ id: 1842, state: "Closed" });

    expect(filterWorkItems([active, closed], { titleQuery: "1842", states: ["Active"] })).toEqual([active]);
  });

  it("IDS-05 lässt die vorhandene Reihenfolge und den Schnellfilter bei der ID-Suche bestehen", () => {
    const activeMatch = bug({ id: 1842, state: "Active", title: "Unabhängiger Titel" });
    const closedOther = bug({ id: 1843, state: "Closed", title: "Export" });
    const manuallyOrdered = [closedOther, activeMatch];

    expect(filterWorkItems(manuallyOrdered, { titleQuery: "" })).toEqual(manuallyOrdered);
    expect(filterOpenBugs(filterWorkItems(manuallyOrdered, { titleQuery: "1842" }), true)).toEqual([activeMatch]);
  });

  it("IDS-06 behält die bestehende Textsuche für Bugs und Test Cases bei", () => {
    const matchingBug = bug({ id: 100, title: "Anmeldung schlägt fehl" });
    const matchingTestCase = testCase({ workItemId: 101, title: "Anderer Titel", suitePath: "Root > Anmeldung" });

    expect(filterWorkItems([matchingBug, bug({ id: 102, title: "Export" })], { titleQuery: "anmeldung" })).toEqual([matchingBug]);
    expect(filterTestCases([matchingTestCase, testCase({ workItemId: 103, title: "Export", suitePath: "Root > Export" })], { titleQuery: "anmeldung" })).toEqual([matchingTestCase]);
  });

  it("IDS-06 lässt leere und gemischt-numerische Eingaben als bestehende Textsuche unverändert", () => {
    const bugTextMatch = bug({ id: 200, title: "Bug 1842a" });
    const testCaseTextMatch = testCase({ workItemId: 201, title: "Test 1842a", suitePath: "Root > Regression" });
    const bugs = [bugTextMatch, bug({ id: 202, title: "Export" })];
    const testCases = [testCaseTextMatch, testCase({ workItemId: 203, title: "Export", suitePath: "Root > Export" })];

    expect(filterWorkItems(bugs, { titleQuery: "" })).toEqual(bugs);
    expect(filterTestCases(testCases, { titleQuery: "" })).toEqual(testCases);
    expect(filterWorkItems(bugs, { titleQuery: "1842a" })).toEqual([bugTextMatch]);
    expect(filterTestCases(testCases, { titleQuery: "1842a" })).toEqual([testCaseTextMatch]);
  });
});
