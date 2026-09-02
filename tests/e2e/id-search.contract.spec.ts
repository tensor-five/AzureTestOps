import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "azure-testops-id-search-"));
  const output = path.join(directory, "harness.js");
  await build({
    entryPoints: ["tests/e2e/id-search.contract-harness.tsx"],
    bundle: true,
    format: "iife",
    platform: "browser",
    outfile: output
  });
  const [bundle, tokens, controls, filters, relations] = await Promise.all([
    readFile(output, "utf8"),
    readFile("src/app/bootstrap/local-ui-tokens.css", "utf8"),
    readFile("src/app/bootstrap/local-ui-controls.css", "utf8"),
    readFile("src/app/bootstrap/local-ui-filters.css", "utf8"),
    readFile("src/app/bootstrap/local-ui-relations.css", "utf8")
  ]);
  await rm(directory, { recursive: true, force: true });
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<style>${tokens}</style><style>${controls}</style><style>${filters}</style><style>${relations}</style><div id="root"></div><script>${bundle}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("IDS-01 bis IDS-04 suchen Bugs und Test Cases über vollständige IDs und heben Treffer hervor", async ({ page }) => {
  await page.goto(origin);
  const testCases = page.getByRole("searchbox", { name: "Search Test cases" });
  const bugs = page.getByRole("searchbox", { name: "Search Work items" });

  await testCases.fill("#1842");
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(1);
  await expect(page.locator(".relations-view-card-test-case .relations-view-card-id mark")).toHaveText("#1842");

  await bugs.fill("1842");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  await expect(page.locator(".relations-view-card-work-item .relations-view-card-id mark")).toHaveText("1842");

  await testCases.fill("184");
  await bugs.fill("184");
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(0);
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(0);

  await testCases.fill("1842");
  await bugs.fill("1842");
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(1);
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
});

test("IDS-02, IDS-04, IDS-06 und IDS-07 erhalten Textsuche, Hervorhebung und Tastaturbedienung", async ({ page }) => {
  await page.goto(origin);
  const bugs = page.getByRole("searchbox", { name: "Search Work items" });
  const testCases = page.getByRole("searchbox", { name: "Search Test cases" });

  await expect(bugs).toHaveAttribute("type", "search");
  await expect(testCases).toHaveAttribute("type", "search");
  await bugs.focus();
  await expect(bugs).toBeFocused();
  await page.keyboard.type("Anmeldung");
  await testCases.focus();
  await expect(testCases).toBeFocused();
  await page.keyboard.type("Anmeldung");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(3);
  await expect(page.locator(".relations-view-card-work-item .relations-view-card-title mark")).toHaveText("Anmeldung");
  await expect(page.locator(".relations-view-card-test-case .relations-view-card-title mark")).toHaveText("Anmeldung");
  await expect(page.locator(".relations-view-suite-name mark")).toHaveText("Anmeldung");

  await bugs.fill("");
  await testCases.fill("");
  await expect(page.locator(".relations-view-column-work-items .filter-bar-result-summary")).toHaveText("3 results");
  await expect(page.locator(".relations-view-column-test-cases .filter-bar-result-summary")).toHaveText("3 results");

  await bugs.fill("Bug 1842a");
  await testCases.fill("Test 1842a");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(0);
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(0);
});

test("IDS-05 erhält Ergebnisanzahl, Schnellfilter, Sortierung und manuelle Drag-and-drop-Reihenfolge", async ({ page }) => {
  await page.goto(origin);
  const bugs = page.getByRole("searchbox", { name: "Search Work items" });
  const testCases = page.getByRole("searchbox", { name: "Search Test cases" });
  const bugRows = page.locator("[data-work-item-id]");
  const testCaseRows = page.locator("[data-test-case-id]");
  const reorder11842 = page.getByRole("button", { name: "Reorder work item #11842" });
  const reorderTestCase11842 = page.getByRole("button", { name: "Reorder test case #11842" });

  await expect(page.locator(".relations-view-column-work-items .filter-bar-result-summary")).toHaveText("3 results");
  expect(await bugRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-work-item-id")))).toEqual(["1842", "1843", "11842"]);
  await expect(reorder11842).toHaveAttribute("draggable", "true");
  await expect(reorder11842).toHaveAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");

  await reorder11842.dragTo(page.locator('[data-work-item-id="1843"]'));
  expect(await bugRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-work-item-id")))).toEqual(["1842", "11842", "1843"]);

  await bugs.fill("1842");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  await expect(page.locator(".relations-view-column-work-items .filter-bar-result-summary")).toHaveText("1 results");
  await bugs.fill("");
  expect(await bugRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-work-item-id")))).toEqual(["1842", "11842", "1843"]);

  expect(await testCaseRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-test-case-id")))).toEqual(["1842", "1843", "11842"]);
  await page.getByRole("button", { name: "Testfälle in Suite Anmeldung einmalig sortieren" }).click();
  await page.getByRole("menuitemradio", { name: "Titel · Aufsteigend" }).click();
  expect(await testCaseRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-test-case-id")))).toEqual(["11842", "1842", "1843"]);
  await testCases.fill("1842");
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(1);
  await testCases.fill("");
  expect(await testCaseRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-test-case-id")))).toEqual(["11842", "1842", "1843"]);
  await reorderTestCase11842.dragTo(page.locator('[data-test-case-id="1843"]'));
  expect(await testCaseRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-test-case-id")))).toEqual(["1842", "11842", "1843"]);
  await testCases.fill("1842");
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(1);
  await testCases.fill("");
  expect(await testCaseRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-test-case-id")))).toEqual(["1842", "11842", "1843"]);

  await page.getByRole("button", { name: "Toggle Work items filters" }).click();
  const openBugs = page.getByRole("button", { name: "Open bugs" });
  await openBugs.click();
  await expect(openBugs).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(2);
  await bugs.fill("1842");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  await expect(openBugs).toHaveAttribute("aria-pressed", "true");
});
