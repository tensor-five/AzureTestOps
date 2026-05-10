import { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { FAVICON_SVG, writeFaviconSvg } from "./favicon-svg.js";

function fakeResponse(): {
  res: ServerResponse;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  written: { status?: number; body?: Buffer };
} {
  const written: { status?: number; body?: Buffer } = {};
  const setHeader = vi.fn();
  const end = vi.fn((payload?: Buffer | string) => {
    if (Buffer.isBuffer(payload)) {
      written.body = payload;
    } else if (typeof payload === "string") {
      written.body = Buffer.from(payload, "utf8");
    }
  });

  const res = {
    statusCode: 0,
    setHeader,
    end,
    headersSent: false,
    getHeaders: () => ({}),
    getHeader: () => undefined
  } as unknown as ServerResponse;

  return {
    res,
    setHeader,
    end,
    get written() {
      written.status = res.statusCode;
      return written;
    }
  };
}

describe("favicon-svg", () => {
  it("FAVICON_SVG is a valid standalone SVG document", () => {
    expect(FAVICON_SVG).toMatch(/^<\?xml version="1\.0"/);
    expect(FAVICON_SVG).toMatch(/<svg /);
    expect(FAVICON_SVG).toMatch(/<\/svg>$/);
  });

  it("uses the brand hex values that mirror local-ui-tokens.css", () => {
    expect(FAVICON_SVG).toContain("#842CC3"); // --color-primary
    expect(FAVICON_SVG).toContain("#ffffff"); // --color-on-primary
    expect(FAVICON_SVG).toContain("#87F3A4"); // --color-secondary
  });

  it("writeFaviconSvg responds 200 with image/svg+xml content-type", () => {
    const harness = fakeResponse();

    writeFaviconSvg(harness.res);

    expect(harness.res.statusCode).toBe(200);
    expect(harness.setHeader).toHaveBeenCalledWith(
      "content-type",
      "image/svg+xml; charset=utf-8"
    );
    expect(harness.end).toHaveBeenCalledTimes(1);
  });

  it("writes the SVG body byte-for-byte", () => {
    const harness = fakeResponse();
    writeFaviconSvg(harness.res);
    expect(harness.written.body?.toString("utf8")).toBe(FAVICON_SVG);
  });
});
