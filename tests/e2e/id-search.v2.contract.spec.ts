import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "azure-testops-id-search-v2-"));
  const output = path.join(directory, "harness.js");
  await build({ entryPoints: ["tests/e2e/id-search.v2.contract-harness.tsx"], bundle: true, format: "iife", platform: "browser", outfile: output });
  const [bundle, tokens, controls, filters, relations] = await Promise.all([readFile(output, "utf8"), readFile("src/app/bootstrap/local-ui-tokens.css", "utf8"), readFile("src/app/bootstrap/local-ui-controls.css", "utf8"), readFile("src/app/bootstrap/local-ui-filters.css", "utf8"), readFile("src/app/bootstrap/local-ui-relations.css", "utf8")]);
  await rm(directory, { recursive: true, force: true });
  server = createServer((_request, response) => { response.end(`<style>${tokens}${controls}${filters}${relations}</style><div id="root"></div><script>${bundle}</script>`); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an", async ({ page }) => {
  await page.goto(origin);
  const bugs = page.getByRole("searchbox", { name: "Search Work items" });
  const testCases = page.getByRole("searchbox", { name: "Search Test cases" });

  await bugs.fill("#184");
  await testCases.fill("#184");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(3);
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(3);
  await expect(page.locator(".relations-view-card-work-item .relations-view-card-id mark")).toHaveCount(2);
  await expect(page.locator(".relations-view-card-test-case .relations-view-card-id mark")).toHaveCount(2);
  await expect(page.locator(".relations-view-card-title mark")).toHaveText(["184", "184"]);
  await expect(page.locator(".relations-view-suite-name mark")).toHaveText("184");

  await bugs.focus();
  await expect(bugs).toBeFocused();
  await testCases.focus();
  await expect(testCases).toBeFocused();
  await bugs.fill("Anmeldung");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
});
