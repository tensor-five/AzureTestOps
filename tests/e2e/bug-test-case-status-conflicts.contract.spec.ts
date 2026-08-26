import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";

const conflictStroke = "rgb(207, 51, 66)";
let server: Server;
let origin: string;
let bundle = "";

test.beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "azure-testops-conflict-test-"));
  const output = path.join(directory, "harness.js");
  await build({
    entryPoints: ["tests/e2e/bug-test-case-status-conflicts-harness.tsx"],
    bundle: true,
    format: "iife",
    platform: "browser",
    outfile: output
  });
  bundle = await readFile(output, "utf8");
  await rm(directory, { recursive: true, force: true });
  const [tokens, relations] = await Promise.all([
    readFile("src/app/bootstrap/local-ui-tokens.css", "utf8"),
    readFile("src/app/bootstrap/local-ui-relations.css", "utf8")
  ]);
  server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<style>${tokens}</style><style>${relations}</style><div id="root"></div><script>${bundle}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("BSC-07 behält das sichtbare Konfliktrot bei Auswahl der Verbindung", async ({ page }) => {
  await page.goto(origin);
  const neutralStroke = await relationLineStyle(page).then((style) => style.stroke);
  await page.goto(`${origin}/?selected=true`);
  const selectedStroke = await relationLineStyle(page).then((style) => style.stroke);

  expect(neutralStroke).toBe(conflictStroke);
  expect(selectedStroke).toBe(conflictStroke);
});

test("BSC-08 zeigt eine ausstehende Konfliktverbindung weiterhin rot und gestrichelt", async ({ page }) => {
  await page.goto(`${origin}/?pending=true`);
  const style = await relationLineStyle(page);

  expect(style.stroke).toBe(conflictStroke);
  expect(style.strokeDasharray).not.toBe("none");
});

async function relationLineStyle(page: Page): Promise<{ stroke: string; strokeDasharray: string }> {
  const svg = page.locator("svg");
  await expect(svg).toBeVisible();
  return svg.evaluate((element) => {
    const styles = [...element.querySelectorAll("line, path, polyline")]
      .map((line) => getComputedStyle(line))
      .filter((style) => style.stroke !== "none" && style.stroke !== "transparent");
    const style = styles.find((candidate) => candidate.stroke !== "rgba(0, 0, 0, 0)");
    if (!style) throw new Error("Keine sichtbare Relationslinie gefunden.");
    return { stroke: style.stroke, strokeDasharray: style.strokeDasharray };
  });
}
