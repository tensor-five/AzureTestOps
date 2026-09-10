import * as React from "react";
import { createRoot } from "react-dom/client";
import type { ActiveSetSnapshot } from "../../src/application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../src/app/composition/test-client-ports.js";
import { RelationsPane } from "../../src/features/relations-view/relations-pane.js";

const titles = ["Dataload", "Export", "Kontrolle"];
const snapshot: ActiveSetSnapshot = {
  set: { id: "magic-sort-filter", name: "Filter regression", planId: "1", rootSuiteId: "1", queryId: "Q-1" },
  suiteTree: { id: 1, name: "Testplan", parentSuiteId: null, path: "Testplan", children: [{ id: 2, name: "Fachbereich", parentSuiteId: 1, path: "Testplan > Fachbereich", children: [{ id: 3, name: "Datenimport", parentSuiteId: 2, path: "Testplan > Fachbereich > Datenimport", children: [] }] }] },
  projections: titles.map((title, i) => ({ workItemId: 101 + i, suiteId: 3, suitePath: "Testplan > Fachbereich > Datenimport", title, state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [201 + i], testPointId: null, configurationId: null, configurationName: null, lastOutcome: "Failed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null })),
  workItemsFromQuery: titles.map((title, i) => ({ id: 201 + i, title, workItemType: "Bug", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [101 + i] })),
  loadedAt: "2026-09-10T10:00:00.000Z"
};
const ports = buildClientPortsStub({ relationMutations: { add: async () => undefined, remove: async () => undefined } });
createRoot(document.getElementById("root")!).render(<WithClientPorts ports={ports}><RelationsPane setId={snapshot.set.id} snapshot={snapshot} isLoading={false} error={null} hasActiveSet /></WithClientPorts>);
