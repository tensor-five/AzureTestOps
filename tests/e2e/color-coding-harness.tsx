import * as React from "react";
import { createRoot } from "react-dom/client";
import { WithClientPorts, buildClientPortsStub } from "../../src/app/composition/test-client-ports.js";
import { HttpUserPreferencesAdapter } from "../../src/adapters/http/http-user-preferences.adapter.js";
import { installUserPreferencesPort } from "../../src/shared/user-preferences/user-preferences.client.js";
import { useUserPreferencesBootstrap } from "../../src/app/bootstrap/use-user-preferences-bootstrap.js";
import { PreferenceSyncError } from "../../src/app/bootstrap/user-preferences-shell-status.js";
import { RelationsPane } from "../../src/features/relations-view/relations-pane.js";
import { colorCodingSnapshot } from "./color-coding-fixtures.js";

const preferences = new HttpUserPreferencesAdapter();
installUserPreferencesPort(preferences);
const ports = buildClientPortsStub({
  userPreferences: preferences,
  adoContext: { getContext: async () => null, setContext: async value => value, getCliDefaults: async () => ({ organization: "", project: "" }) },
  relationMutations: { add: async () => { await fetch("/test/ado-mutation", { method: "POST" }); }, remove: async () => { await fetch("/test/ado-mutation", { method: "POST" }); } }
});
function Harness() {
  const { preferences: hydrated, syncStatus } = useUserPreferencesBootstrap();
  const [setId, setSetId] = React.useState("set-a");
  const [refreshed, setRefreshed] = React.useState(false);
  const snapshot = React.useMemo(() => colorCodingSnapshot(setId, refreshed), [setId, refreshed]);
  return <WithClientPorts ports={ports}>
    <label>Set <select aria-label="Harness Set" value={setId} onChange={e => setSetId(e.target.value)}><option>set-a</option><option>set-b</option></select></label>
    <button type="button" onClick={() => setRefreshed(true)}>Harness refresh</button>
    <PreferenceSyncError status={syncStatus} />
    {hydrated && <RelationsPane setId={setId} snapshot={snapshot} isLoading={false} error={null} hasActiveSet />}
  </WithClientPorts>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
