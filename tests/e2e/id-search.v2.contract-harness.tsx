import * as React from "react";
import { createRoot } from "react-dom/client";
import type { ActiveSetSnapshot } from "../../src/application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../src/app/composition/test-client-ports.js";
import { RelationsPane } from "../../src/features/relations-view/relations-pane.js";

const ids = [1842, 11842, 9000];
const snapshot: ActiveSetSnapshot = {
  set: { id: "id-search-v2", name: "ID-Suche v2", planId: "1", rootSuiteId: "1", queryId: "Q-1" },
  suiteTree: { id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [{ id: 2, name: "Regression 184", parentSuiteId: 1, path: "Root > Regression 184", children: [] }] },
  projections: ids.map((workItemId, index) => ({ workItemId, suiteId: index === 2 ? 2 : 1, suitePath: index === 2 ? "Root > Regression 184" : "Root", title: index === 2 ? "Regression 184 verifizieren" : index === 0 ? "Anmeldung" : "Export", state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [], testPointId: null, configurationId: null, configurationName: null, lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null })),
  workItemsFromQuery: ids.map((id, index) => ({ id, workItemType: "Bug", title: index === 2 ? "Regression 184 verhindert Freigabe" : index === 0 ? "Anmeldung" : "Export", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] })),
  loadedAt: "2026-09-02T12:00:00.000Z"
};
const ports = buildClientPortsStub({ adoContext: { getContext: async () => null, setContext: async (value) => value, getCliDefaults: async () => ({ organization: "", project: "" }) }, relationMutations: { add: async () => undefined, remove: async () => undefined } });
createRoot(document.getElementById("root")!).render(<WithClientPorts ports={ports}><RelationsPane setId="id-search-v2" snapshot={snapshot} isLoading={false} error={null} hasActiveSet refreshControl={<button type="button">Refresh</button>} /></WithClientPorts>);
