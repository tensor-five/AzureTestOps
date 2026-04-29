import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AzureCliPreflightAdapter,
  type CliCommandRunner
} from "../../adapters/azure-devops/auth/azure-cli-preflight.adapter.js";
import { LowdbUserPreferencesAdapter } from "../../adapters/persistence/settings/lowdb-user-preferences.adapter.js";
import { LowdbSetRepository } from "../../adapters/persistence/settings/set-repository.adapter.js";
import { FileAdoContextAdapter } from "../../adapters/persistence/settings/file-ado-context.adapter.js";

import { createHttpServer, type HttpServer } from "./http-server.js";

const TEST_PORT = 18821;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeStubRunner(): CliCommandRunner {
  return {
    run: async (command: string) => {
      if (command === "az --version") {
        return { stdout: "azure-cli 2.0", stderr: "", exitCode: 0 };
      }
      if (command === "az extension show --name azure-devops -o json") {
        return { stdout: '{"name":"azure-devops"}', stderr: "", exitCode: 0 };
      }
      if (command === "az account show -o json") {
        return { stdout: '{"tenantId":"abc"}', stderr: "", exitCode: 0 };
      }
      if (command === "az devops configure --list") {
        return { stdout: "[defaults]\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: `unexpected: ${command}`, exitCode: 1 };
    }
  };
}

describe("http-server", () => {
  let server: HttpServer;
  let tempDir: string;
  let csrfToken: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-server-"));
    const userPreferences = new LowdbUserPreferencesAdapter(
      path.join(tempDir, "user-preferences.json"),
      "test-user"
    );
    const preflightAdapter = new AzureCliPreflightAdapter(makeStubRunner());
    const setRepository = new LowdbSetRepository({ preferences: userPreferences });
    const adoContext = new FileAdoContextAdapter(path.join(tempDir, "ado-context.json"));

    server = createHttpServer({
      port: TEST_PORT,
      deps: {
        preflight: preflightAdapter,
        userPreferences,
        setRepository,
        adoContext
      },
      preflightContext: { organization: "contoso", project: "delivery" },
      azLoginRunner: async () => ({ message: "noop" })
    });

    const html = await (await fetch(`${BASE_URL}/`)).text();
    const match = html.match(/name="ado-csrf-token" content="([^"]+)"/);
    csrfToken = match ? match[1] : "";
  });

  afterAll(async () => {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("serves the HTML shell with CSRF meta", async () => {
    const response = await fetch(`${BASE_URL}/`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<div id="app"></div>');
    expect(body).toContain("<title>Azure TestOps</title>");
    expect(csrfToken.length).toBeGreaterThan(20);
  });

  it("returns OK on /health", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("OK");
  });

  it("serves the SVG favicon", async () => {
    const response = await fetch(`${BASE_URL}/favicon.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("runs the auth preflight via injected adapter", async () => {
    const response = await fetch(`${BASE_URL}/phase2/auth-preflight`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { status: string } };
    expect(body.result.status).toBe("READY");
  });

  it("rejects user-preferences POST without CSRF", async () => {
    const response = await fetch(`${BASE_URL}/phase2/user-preferences`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: { themeMode: "dark" } })
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("CSRF_INVALID");
  });

  it("persists and reads back user preferences with valid CSRF", async () => {
    const post = await fetch(`${BASE_URL}/phase2/user-preferences`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({ preferences: { themeMode: "dark" } })
    });
    expect(post.status).toBe(200);

    const get = await fetch(`${BASE_URL}/phase2/user-preferences`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { preferences: { themeMode?: string } };
    expect(body.preferences.themeMode).toBe("dark");
  });

  it("returns null context before configuration and persists POSTed context", async () => {
    const initial = await fetch(`${BASE_URL}/phase2/ado-context`);
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as { context: unknown };
    expect(initialBody.context).toBeNull();

    const reject = await fetch(`${BASE_URL}/phase2/ado-context`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organization: "contoso", project: "delivery" })
    });
    expect(reject.status).toBe(403);

    const ok = await fetch(`${BASE_URL}/phase2/ado-context`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({ organization: "contoso", project: "delivery" })
    });
    expect(ok.status).toBe(200);

    const after = await fetch(`${BASE_URL}/phase2/ado-context`);
    const afterBody = (await after.json()) as { context: { organization: string; project: string } };
    expect(afterBody.context).toEqual({ organization: "contoso", project: "delivery" });
  });

  it("CRUD-cycles a set and switches the active pointer", async () => {
    const create = await fetch(`${BASE_URL}/phase2/sets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({
        name: "Sprint 24",
        planId: "9",
        rootSuiteId: "1",
        queryId: "Q-A",
        setActive: true
      })
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { set: { id: string; name: string } };
    const setId = created.set.id;
    expect(created.set.name).toBe("Sprint 24");

    const list = await fetch(`${BASE_URL}/phase2/sets`);
    const listBody = (await list.json()) as { sets: Array<{ id: string }>; activeSetId: string | null };
    expect(listBody.sets.some((entry) => entry.id === setId)).toBe(true);
    expect(listBody.activeSetId).toBe(setId);

    const patch = await fetch(`${BASE_URL}/phase2/sets/${setId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({ name: "Sprint 24 — Renamed" })
    });
    expect(patch.status).toBe(200);
    const patchBody = (await patch.json()) as { set: { name: string } };
    expect(patchBody.set.name).toBe("Sprint 24 — Renamed");

    const clear = await fetch(`${BASE_URL}/phase2/active-set`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({ setId: null })
    });
    expect(clear.status).toBe(200);

    const del = await fetch(`${BASE_URL}/phase2/sets/${setId}`, {
      method: "DELETE",
      headers: { "x-ado-csrf-token": csrfToken }
    });
    expect(del.status).toBe(200);

    const finalList = await fetch(`${BASE_URL}/phase2/sets`);
    const finalBody = (await finalList.json()) as { sets: Array<{ id: string }> };
    expect(finalBody.sets.some((entry) => entry.id === setId)).toBe(false);
  });

  it("rejects an invalid set creation payload", async () => {
    const response = await fetch(`${BASE_URL}/phase2/sets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ado-csrf-token": csrfToken
      },
      body: JSON.stringify({ name: "missing identifiers" })
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 404 on unknown paths", async () => {
    const response = await fetch(`${BASE_URL}/does-not-exist`);
    expect(response.status).toBe(404);
  });
});
