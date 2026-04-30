import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AzureCliPreflightAdapter } from "../../../adapters/azure-devops/auth/azure-cli-preflight.adapter.js";
import { LowdbUserPreferencesAdapter } from "../../../adapters/persistence/settings/lowdb-user-preferences.adapter.js";
import { LowdbSetRepository } from "../../../adapters/persistence/settings/set-repository.adapter.js";
import { FileAdoContextAdapter } from "../../../adapters/persistence/settings/file-ado-context.adapter.js";
import type { AdoContextPort } from "../../../application/ports/ado-context.port.js";
import type { RelationPort } from "../../../application/ports/relation.port.js";
import type { SavedQueryPort } from "../../../application/ports/saved-query.port.js";
import type { SetRepositoryPort } from "../../../application/ports/set-repository.port.js";
import type { TestCaseHydrationPort } from "../../../application/ports/test-case-hydration.port.js";
import type { TestCatalogPort } from "../../../application/ports/test-catalog.port.js";
import type { TestManagementReadPort } from "../../../application/ports/test-management.port.js";
import type { WorkItemHydrationPort } from "../../../application/ports/work-item-hydration.port.js";
import { createHttpServer, type HttpServer } from "../http-server.js";
import type { AdoRuntime } from "../../composition/runtime.js";

const TEST_PORT = 18831;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeStubAdo(): AdoRuntime {
  const testManagement: TestManagementReadPort = {
    loadSuiteTree: async () => ({ id: 1, name: "Root", parentSuiteId: null, path: "Root", children: [] }),
    listTestCasesInSuite: async () => [],
    loadPointsForSuite: async () => [],
    listRunsForPlan: async () => [],
    loadResultsForRun: async () => []
  };
  const workItemHydration: WorkItemHydrationPort = {
    hydrateWorkItems: async () => new Map()
  };
  const testCaseHydration: TestCaseHydrationPort = {
    hydrateTestCases: async () => new Map()
  };
  const savedQuery: SavedQueryPort = {
    listSavedQueries: async () => [],
    executeQuery: async () => ({ workItemIds: [], relations: [] })
  };
  const testCatalog: TestCatalogPort = {
    listTestPlans: async () => [],
    listSuitesForPlan: async () => []
  };
  const relations: RelationPort = {
    addRelation: async () => undefined,
    removeRelation: async () => undefined
  };

  return {
    resolveContext: async () => ({ organization: "c", project: "p" }),
    testManagement: async () => testManagement,
    testCatalog: async () => testCatalog,
    workItemHydration: async () => workItemHydration,
    testCaseHydration: async () => testCaseHydration,
    savedQuery: async () => savedQuery,
    relations: async () => relations
  };
}

describe("active-set-snapshot SSE route", () => {
  let tempDir: string;
  let server: HttpServer;
  let setRepository: SetRepositoryPort;
  let adoContext: AdoContextPort;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-sse-"));
    const userPreferences = new LowdbUserPreferencesAdapter(
      path.join(tempDir, "user-preferences.json"),
      "tester"
    );
    setRepository = new LowdbSetRepository({ preferences: userPreferences });
    adoContext = new FileAdoContextAdapter(path.join(tempDir, "ado-context.json"));
    await adoContext.setContext({ organization: "c", project: "p" });

    server = createHttpServer({
      port: TEST_PORT,
      preflightContext: { organization: "c", project: "p" },
      azLoginRunner: async () => ({ message: "noop" }),
      deps: {
        preflight: new AzureCliPreflightAdapter({
          run: async () => ({ stdout: "", stderr: "", exitCode: 0 })
        }),
        userPreferences,
        setRepository,
        adoContext,
        ado: makeStubAdo()
      }
    });
  });

  afterAll(async () => {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("emits progress events and a result event for a configured set", async () => {
    const created = await setRepository.create({
      name: "Test Set",
      planId: "5",
      rootSuiteId: "1",
      queryId: "Q-1"
    });

    const response = await fetch(
      `${BASE_URL}/phase2/active-set/snapshot/stream?setId=${encodeURIComponent(created.id)}`,
      {
        headers: { accept: "text/event-stream" }
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const body = await response.text();
    const events = parseSseEvents(body);
    const eventNames = events.map((event) => event.event);

    expect(eventNames).toContain("progress");
    expect(eventNames).toContain("result");
    expect(eventNames[eventNames.length - 1]).toBe("result");

    const result = events[events.length - 1];
    const data = JSON.parse(result.data) as { snapshot: { set: { id: string } } };
    expect(data.snapshot.set.id).toBe(created.id);
  });

  it("emits an error event with the use-case error code when the set is missing", async () => {
    const response = await fetch(
      `${BASE_URL}/phase2/active-set/snapshot/stream?setId=ghost`,
      {
        headers: { accept: "text/event-stream" }
      }
    );
    const body = await response.text();
    const events = parseSseEvents(body);

    expect(events.some((event) => event.event === "error" && event.data.includes("SET_NOT_FOUND"))).toBe(true);
  });
});

type SseEvent = { event: string; data: string };

function parseSseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of raw.split(/\n\n/)) {
    const lines = block.split(/\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice("data: ".length));
      }
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }
  return events;
}
