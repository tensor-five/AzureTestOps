import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpServer, type HttpServer } from "./http-server.js";

const TEST_PORT = 18821;

describe("http-server", () => {
  let server: HttpServer;

  beforeAll(() => {
    server = createHttpServer({ port: TEST_PORT });
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves the HTML shell on GET /", async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<div id="app"></div>');
    expect(body).toContain("<title>Azure TestOps</title>");
  });

  it("serves the SVG favicon", async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/favicon.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("returns 200 OK on GET /health", async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("OK");
  });

  it("returns 404 for unknown paths", async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/does-not-exist`);
    expect(response.status).toBe(404);
  });
});
