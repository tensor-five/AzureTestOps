import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { LowdbUserPreferencesAdapter } from "../../src/adapters/persistence/settings/lowdb-user-preferences.adapter.js";

export async function startColorCodingServer() {
  const directory = await mkdtemp(path.join(tmpdir(), "color-coding-contract-"));
  const output = path.join(directory, "harness.js");
  await build({ entryPoints: ["tests/e2e/color-coding-harness.tsx"], bundle: true, format: "iife", platform: "browser", outfile: output });
  const bundle = await readFile(output, "utf8");
  const css = (await Promise.all(["tokens", "controls", "filters", "relations"].map(name => readFile(`src/app/bootstrap/local-ui-${name}.css`, "utf8")))).join("\n");
  let adapter = new LowdbUserPreferencesAdapter(path.join(directory, "preferences.json"), "contract-user");
  let mutations = 0;
  const server = createServer(async (request, response) => {
    try {
      response.setHeader("content-type", "application/json");
      if (request.url === "/test/ado-mutation") { mutations++; response.end("{}"); return; }
      if (request.url === "/phase2/user-preferences") {
        if (request.method === "POST") {
          let body = ""; for await (const chunk of request) body += chunk;
          response.end(JSON.stringify({ preferences: await adapter.mergePreferences(JSON.parse(body).preferences) }));
        } else response.end(JSON.stringify({ preferences: await adapter.getPreferences() }));
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle}</script></html>`);
    } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    reset: async () => { await adapter.updatePreferences(() => ({})); mutations = 0; },
    seed: (preferences: Parameters<LowdbUserPreferencesAdapter["mergePreferences"]>[0]) => adapter.mergePreferences(preferences),
    reopenDatabase: () => { adapter = new LowdbUserPreferencesAdapter(path.join(directory, "preferences.json"), "contract-user"); },
    disk: () => readFile(path.join(directory, "preferences.json"), "utf8"),
    mutations: () => mutations,
    close: async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(directory, { recursive: true, force: true }); }
  };
}
