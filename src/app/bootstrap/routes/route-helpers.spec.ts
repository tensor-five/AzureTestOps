import { describe, expect, it } from "vitest";
import type { ServerResponse } from "node:http";

import { applySecurityHeaders, errorPayload, parseJsonBody } from "./route-helpers.js";

describe("route-helpers", () => {
  describe("applySecurityHeaders", () => {
    it("keeps the CSP free of external font and style origins", () => {
      const headers = new Map<string, string>();
      const res = {
        setHeader(name: string, value: number | string | readonly string[]) {
          headers.set(name.toLowerCase(), String(value));
          return this;
        }
      } as unknown as ServerResponse;

      applySecurityHeaders(res);

      const csp = headers.get("content-security-policy") ?? "";
      expect(csp).not.toMatch(/fontshare/i);
      expect(readDirective(csp, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
      expect(readDirective(csp, "font-src")).toEqual(["'self'", "data:"]);
      expect(readDirective(csp, "connect-src")).toEqual(["'self'"]);
      expect(readDirective(csp, "style-src").some(isExternalOrigin)).toBe(false);
      expect(readDirective(csp, "font-src").some(isExternalOrigin)).toBe(false);
    });
  });

  describe("parseJsonBody", () => {
    it("returns null for empty bodies", () => {
      expect(parseJsonBody("")).toBeNull();
    });

    it("returns parsed JSON for valid bodies", () => {
      expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 });
    });

    it("returns null for malformed JSON", () => {
      expect(parseJsonBody("{not json")).toBeNull();
    });
  });

  describe("errorPayload", () => {
    it("uses the error.code and message when present", () => {
      class CustomError extends Error {
        public readonly code = "MY_CODE";
      }
      const payload = errorPayload(new CustomError("boom"), "FALLBACK");
      expect(payload).toEqual({ code: "MY_CODE", message: "boom" });
    });

    it("falls back to the provided code when error has none", () => {
      const payload = errorPayload(new Error("boom"), "FALLBACK");
      expect(payload).toEqual({ code: "FALLBACK", message: "boom" });
    });

    it("returns a generic envelope for non-Error values", () => {
      const payload = errorPayload("strings are weird", "FALLBACK");
      expect(payload).toEqual({ code: "FALLBACK", message: "Unexpected error." });
    });
  });
});

function readDirective(csp: string, directive: string): string[] {
  const match = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  return match ? match.split(/\s+/).slice(1) : [];
}

function isExternalOrigin(source: string): boolean {
  return /^https?:\/\//i.test(source);
}
