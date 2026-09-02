// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import { TestCaseCard } from "../relations-view/test-case-card.js";
import { WorkItemCard } from "../relations-view/work-item-card.js";
import { filterTestCases } from "./test-case-filters.js";
import { filterWorkItems } from "./work-item-filters.js";

const bugs: WorkItem[] = [
  { id: 1842, workItemType: "Bug", title: "Anmeldung", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] },
  { id: 11842, workItemType: "Bug", title: "Export", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] },
  { id: 9000, workItemType: "Bug", title: "Regression 184 verhindert Freigabe", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] }
];
const testCases: TestCaseProjection[] = bugs.map((bug, index) => ({
  workItemId: bug.id, suiteId: 1, suitePath: index === 2 ? "Root > Suite 184" : "Root > Regression", title: bug.title,
  state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null, priority: null,
  relatedIds: [], testPointId: null, configurationId: null, configurationName: null, lastOutcome: "Passed",
  lastResultId: null, lastResultCompletedDate: null, lastRunId: null
}));

function render(ui: React.ReactElement): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(ui));
  return host;
}

describe("Vertrag IDSC-01 bis IDSC-07: durchgängige Contains-Suche", () => {
  it("IDSC-01 und IDSC-03 finden Zahlenteiltreffer in Bug-IDs und Bug-Titeln, mit optionalem #", () => {
    expect(filterWorkItems(bugs, { titleQuery: "184" })).toEqual(bugs);
    expect(filterWorkItems(bugs, { titleQuery: "#184" })).toEqual(bugs);
  });

  it("IDSC-02 und IDSC-03 finden Zahlenteiltreffer in Test-Case-IDs, Titeln und Suite-Pfaden", () => {
    expect(filterTestCases(testCases, { titleQuery: "184" })).toEqual(testCases);
    expect(filterTestCases(testCases, { titleQuery: "#184" })).toEqual(testCases);
  });

  it("IDSC-04 hebt Zahlenteiltreffer in Bug- und Test-Case-IDs sowie Titeln hervor", () => {
    const host = render(<><WorkItemCard workItem={bugs[0]} highlightQuery="184" /><WorkItemCard workItem={bugs[2]} highlightQuery="#184" /><TestCaseCard projection={testCases[0]} highlightQuery="#184" /><TestCaseCard projection={testCases[2]} highlightQuery="#184" /></>);
    expect(host.querySelectorAll(".relations-view-card-id mark")).toHaveLength(2);
    expect(host.querySelectorAll(".relations-view-card-title mark")).toHaveLength(2);
    expect(host.querySelectorAll(".relations-view-card-title mark")[0]?.textContent).toBe("184");
  });

  it("IDSC-05 bis IDSC-07 erhalten Facetten, leere, gemischte und groß-/kleingeschriebene Eingaben", () => {
    expect(filterWorkItems(bugs, { titleQuery: "", states: ["Active"] })).toEqual(bugs);
    expect(filterWorkItems([{ ...bugs[0], title: "ANMELDUNG" }], { titleQuery: "anMELdung" })).toEqual([{ ...bugs[0], title: "ANMELDUNG" }]);
    expect(filterTestCases(testCases, { titleQuery: "anMELdung" })).toEqual([testCases[0]]);
    expect(filterWorkItems([{ ...bugs[2], title: "Regression 184A verhindert Freigabe" }], { titleQuery: "184a" })).toEqual([{ ...bugs[2], title: "Regression 184A verhindert Freigabe" }]);
    expect(filterTestCases([{ ...testCases[2], suitePath: "Root > Suite 184A" }], { titleQuery: "184a" })).toEqual([{ ...testCases[2], suitePath: "Root > Suite 184A" }]);
  });
});
