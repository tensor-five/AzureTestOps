import type { ActiveSetSnapshot } from "../../src/application/dto/active-set-snapshot.dto.js";

export function colorCodingSnapshot(setId: string, refreshed = false): ActiveSetSnapshot {
  const titles = [refreshed ? "Export nach Aktualisierung" : "Login prüfen", "Export prüfen", "Vor Login prüfen", "Login.* prüfen"];
  return {
    set: { id: setId, name: setId, planId: "1", rootSuiteId: "1", queryId: "query" },
    suiteTree: { id: 1, name: "Regression", parentSuiteId: null, path: "Regression", children: [] },
    projections: titles.map((title, index) => ({
      workItemId: 101 + index, suiteId: 1, suitePath: "Regression", title,
      state: index === 1 ? "Design" : "Ready", workItemType: "Test Case", assignedTo: null,
      tags: index === 1 ? ["Regression erweitert"] : ["Regression"], areaPath: null, priority: 2,
      relatedIds: index === 0 ? [501] : [], testPointId: null, configurationId: null, configurationName: null,
      lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null
    })),
    workItemsFromQuery: titles.map((title, index) => ({
      id: 501 + index, title, workItemType: index === 3 ? "Task" : "Bug", state: index === 1 ? "Closed" : "Active",
      assignedTo: null, tags: index === 1 ? ["Regression erweitert"] : ["Regression"], areaPath: null,
      priority: 2, relatedIds: index === 0 ? [101] : []
    })),
    loadedAt: refreshed ? "2026-09-11T12:01:00Z" : "2026-09-11T12:00:00Z"
  };
}
