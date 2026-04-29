import { describe, expect, it } from "vitest";

import { errorPayload, parseJsonBody } from "./route-helpers.js";

describe("route-helpers", () => {
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
