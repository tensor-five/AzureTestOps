import * as React from "react";
import { createRoot } from "react-dom/client";

import type { ActiveSetSnapshot } from "../../src/application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../src/app/composition/test-client-ports.js";
import { RelationsPane } from "../../src/features/relations-view/relations-pane.js";

const snapshot: ActiveSetSnapshot = {
  set: { id: "id-search", name: "ID-Suche", planId: "1", rootSuiteId: "1", queryId: "Q-1" },
  suiteTree: {
    id: 1,
    name: "Root",
    parentSuiteId: null,
    path: "Root",
    children: [{ id: 2, name: "Anmeldung", parentSuiteId: 1, path: "Root > Anmeldung", children: [] }]
  },
  projections: [
    {
      workItemId: 1842, suiteId: 2, suitePath: "Root > Anmeldung", title: "Anmeldung mit gültigen Zugangsdaten",
      state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null,
      priority: 2, relatedIds: [], testPointId: null, configurationId: null, configurationName: null,
      lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null
    },
    {
      workItemId: 1843, suiteId: 2, suitePath: "Root > Anmeldung", title: "Export mit gültigen Daten",
      state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null,
      priority: 2, relatedIds: [], testPointId: null, configurationId: null, configurationName: null,
      lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null
    },
    {
      workItemId: 11842, suiteId: 2, suitePath: "Root > Anmeldung", title: "Anderer Test Case",
      state: "Active", workItemType: "Test Case", assignedTo: null, tags: [], areaPath: null,
      priority: 2, relatedIds: [], testPointId: null, configurationId: null, configurationName: null,
      lastOutcome: "Passed", lastResultId: null, lastResultCompletedDate: null, lastRunId: null
    }
  ],
  workItemsFromQuery: [
    { id: 1842, workItemType: "Bug", title: "Anmeldung schlägt nach Zeitüberschreitung fehl", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: 2, relatedIds: [] },
    { id: 1843, workItemType: "Bug", title: "Export enthält doppelte Zeilen", state: "Closed", assignedTo: null, tags: [], areaPath: null, priority: 2, relatedIds: [] },
    { id: 11842, workItemType: "Bug", title: "Anderer Bug", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: 2, relatedIds: [] }
  ],
  loadedAt: "2026-09-02T12:00:00.000Z"
};

const ports = buildClientPortsStub({
  adoContext: {
    getContext: async () => null,
    setContext: async (context) => context,
    getCliDefaults: async () => ({ organization: "", project: "" })
  },
  relationMutations: { add: async () => undefined, remove: async () => undefined }
});

createRoot(document.getElementById("root")!).render(
  <WithClientPorts ports={ports}>
    <RelationsPane
      setId="id-search"
      snapshot={snapshot}
      isLoading={false}
      error={null}
      hasActiveSet
      refreshControl={<button type="button">Refresh</button>}
    />
  </WithClientPorts>
);
