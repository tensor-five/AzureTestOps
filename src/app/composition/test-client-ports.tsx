import * as React from "react";

import { ClientPortsProvider } from "./client-ports-context.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";

/**
 * Throwing stubs for every {@link ClientPorts} method. Tests overlay the
 * subset of methods their hook actually exercises and pass the merged
 * bundle into {@link withClientPorts} — keeping unrelated calls loud
 * instead of silently returning `undefined`.
 */
function unimplemented<T extends string>(name: T): (..._args: unknown[]) => never {
  return (..._args: unknown[]) => {
    throw new Error(`ClientPorts test stub: ${name}() called without an explicit mock.`);
  };
}

export function buildClientPortsStub(overrides: Partial<ClientPorts> = {}): ClientPorts {
  return {
    activeSetSnapshot: {
      subscribe: unimplemented("activeSetSnapshot.subscribe"),
      ...overrides.activeSetSnapshot
    },
    adoContext: {
      getContext: unimplemented("adoContext.getContext"),
      setContext: unimplemented("adoContext.setContext"),
      getCliDefaults: unimplemented("adoContext.getCliDefaults"),
      ...overrides.adoContext
    },
    authPreflight: {
      check: unimplemented("authPreflight.check"),
      ...overrides.authPreflight
    },
    relationMutations: {
      add: unimplemented("relationMutations.add"),
      remove: unimplemented("relationMutations.remove"),
      ...overrides.relationMutations
    },
    savedQuery: {
      list: unimplemented("savedQuery.list"),
      ...overrides.savedQuery
    },
    setManagement: {
      list: unimplemented("setManagement.list"),
      create: unimplemented("setManagement.create"),
      update: unimplemented("setManagement.update"),
      delete: unimplemented("setManagement.delete"),
      setActive: unimplemented("setManagement.setActive"),
      ...overrides.setManagement
    },
    testCatalog: {
      listTestPlans: unimplemented("testCatalog.listTestPlans"),
      listSuitesForPlan: unimplemented("testCatalog.listSuitesForPlan"),
      ...overrides.testCatalog
    },
    testSuiteDeepLink: {
      buildHref: unimplemented("testSuiteDeepLink.buildHref") as never,
      ...overrides.testSuiteDeepLink
    },
    userPreferences: {
      getCached: () => ({}),
      hydrate: () => Promise.resolve({}),
      persistPatch: () => undefined,
      ...overrides.userPreferences
    },
    workItemDeepLink: {
      buildHref: unimplemented("workItemDeepLink.buildHref") as never,
      ...overrides.workItemDeepLink
    }
  };
}

export type WithClientPortsProps = {
  ports: ClientPorts;
  children: React.ReactNode;
};

/** Renders `children` under a {@link ClientPortsProvider} for test harnesses. */
export function WithClientPorts(props: WithClientPortsProps): React.ReactElement {
  return <ClientPortsProvider ports={props.ports}>{props.children}</ClientPortsProvider>;
}
