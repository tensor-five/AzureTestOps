import * as React from "react";

import type { ClientPorts } from "../../application/ports/client/client-ports.js";

const ClientPortsContext = React.createContext<ClientPorts | null>(null);

export type ClientPortsProviderProps = {
  ports: ClientPorts;
  children: React.ReactNode;
};

/**
 * React provider that exposes the composition-root-built {@link ClientPorts}
 * to every feature hook. Tests wrap their harness in `<ClientPortsProvider
 * ports={mockPorts}>` to inject mock adapters without touching globals.
 */
export function ClientPortsProvider(props: ClientPortsProviderProps): React.ReactElement {
  return (
    <ClientPortsContext.Provider value={props.ports}>{props.children}</ClientPortsContext.Provider>
  );
}

/**
 * Returns the active {@link ClientPorts} bundle. Throws if a feature hook is
 * rendered outside a `<ClientPortsProvider>` — that always indicates a
 * wiring bug in the composition layer rather than a recoverable state.
 */
export function useClientPorts(): ClientPorts {
  const ports = React.useContext(ClientPortsContext);
  if (ports === null) {
    throw new Error(
      "useClientPorts() called outside <ClientPortsProvider>. Wrap your tree in the composition root."
    );
  }
  return ports;
}
