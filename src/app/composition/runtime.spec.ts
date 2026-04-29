import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AzureRestHttpClient } from "../../shared/azure-devops/azure-rest-client.js";

import { AdoContextNotConfiguredError, buildRuntime } from "./runtime.js";

function makeStubHttpClient(): AzureRestHttpClient {
  return {
    get: async () => ({ status: 200, json: { value: [] }, headers: {} }),
    patch: async () => ({ status: 200, json: {}, headers: {} })
  };
}

describe("buildRuntime", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-runtime-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function buildHarness() {
    return buildRuntime({
      userPreferencesFilePath: path.join(tempDir, "user-preferences.json"),
      adoContextFilePath: path.join(tempDir, "ado-context.json"),
      localUserId: "tester",
      httpClient: makeStubHttpClient()
    });
  }

  it("exposes ports rather than concrete adapters on the public surface", () => {
    const runtime = buildHarness();
    // Ports are interfaces; presence of the documented methods is the
    // contract — no instanceof checks against concrete adapter classes.
    expect(typeof runtime.preflight.check).toBe("function");
    expect(typeof runtime.userPreferences.getPreferences).toBe("function");
    expect(typeof runtime.userPreferences.mergePreferences).toBe("function");
    expect(typeof runtime.userPreferences.updatePreferences).toBe("function");
    expect(typeof runtime.setRepository.listSets).toBe("function");
    expect(typeof runtime.adoContext.getContext).toBe("function");
  });

  it("rejects ADO adapter access until the ADO context is configured", async () => {
    const runtime = buildHarness();
    await expect(runtime.ado.testManagement()).rejects.toBeInstanceOf(AdoContextNotConfiguredError);
    await expect(runtime.ado.savedQuery()).rejects.toBeInstanceOf(AdoContextNotConfiguredError);
  });

  it("memoizes the Azure adapter bundle while the (org, project) tuple is stable", async () => {
    const runtime = buildHarness();
    await runtime.adoContext.setContext({ organization: "contoso", project: "delivery" });

    const first = await runtime.ado.testManagement();
    const second = await runtime.ado.testManagement();
    const queryFirst = await runtime.ado.savedQuery();

    expect(second).toBe(first);

    // Switching context must invalidate the bundle and produce fresh adapters.
    await runtime.adoContext.setContext({ organization: "contoso", project: "platform" });
    const queryAfterSwitch = await runtime.ado.savedQuery();
    expect(queryAfterSwitch).not.toBe(queryFirst);
  });
});
