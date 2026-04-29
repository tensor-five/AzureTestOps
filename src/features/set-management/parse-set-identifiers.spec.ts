import { describe, expect, it } from "vitest";

import {
  parsePlanAndSuite,
  parsePlanIdentifier,
  parseQueryIdentifier,
  parseSuiteIdentifier
} from "./parse-set-identifiers.js";

describe("parsePlanIdentifier", () => {
  it("returns the bare integer id unchanged", () => {
    expect(parsePlanIdentifier("10519879")).toBe("10519879");
    expect(parsePlanIdentifier("  10519879  ")).toBe("10519879");
  });

  it("rejects zero and non-numeric input", () => {
    expect(parsePlanIdentifier("0")).toBeNull();
    expect(parsePlanIdentifier("")).toBeNull();
    expect(parsePlanIdentifier("abc")).toBeNull();
  });

  it("extracts planId from a real Test Plans URL", () => {
    const url =
      "https://dev.azure.com/tensorfive/tensorfive/_testPlans/define?view=_TestManagement&planId=10519879&suiteId=10519880";
    expect(parsePlanIdentifier(url)).toBe("10519879");
  });

  it("ignores suiteId when asked for planId", () => {
    const url =
      "https://dev.azure.com/tensorfive/tensorfive/_testPlans/execute?suiteId=10519880&planId=42";
    expect(parsePlanIdentifier(url)).toBe("42");
  });

  it("falls back to a regex match when URL parsing fails", () => {
    expect(parsePlanIdentifier("…?view=_TestManagement&planId=42&suiteId=99")).toBe("42");
  });
});

describe("parseSuiteIdentifier", () => {
  it("returns the bare integer id unchanged", () => {
    expect(parseSuiteIdentifier("10519880")).toBe("10519880");
  });

  it("extracts suiteId from a Test Plans URL", () => {
    const url =
      "https://dev.azure.com/tensorfive/tensorfive/_testPlans/define?view=_TestManagement&planId=10519879&suiteId=10519880";
    expect(parseSuiteIdentifier(url)).toBe("10519880");
  });

  it("returns null when neither id nor URL contains suiteId", () => {
    expect(parseSuiteIdentifier("https://dev.azure.com/x/y/_testPlans/define?planId=1")).toBeNull();
  });
});

describe("parsePlanAndSuite", () => {
  it("extracts both ids from a Test Plans URL in one go", () => {
    const url =
      "https://dev.azure.com/tensorfive/tensorfive/_testPlans/define?view=_TestManagement&planId=10519879&suiteId=10519880";
    expect(parsePlanAndSuite(url)).toEqual({ planId: "10519879", rootSuiteId: "10519880" });
  });

  it("treats a bare integer as plan id only", () => {
    expect(parsePlanAndSuite("10519879")).toEqual({ planId: "10519879", rootSuiteId: null });
  });

  it("accepts manual id pairs separated by slash, comma or whitespace", () => {
    expect(parsePlanAndSuite("10519879/10519880")).toEqual({
      planId: "10519879",
      rootSuiteId: "10519880"
    });
    expect(parsePlanAndSuite("10519879, 10519880")).toEqual({
      planId: "10519879",
      rootSuiteId: "10519880"
    });
    expect(parsePlanAndSuite("  10519879   10519880  ")).toEqual({
      planId: "10519879",
      rootSuiteId: "10519880"
    });
  });

  it("returns nulls for empty or unparseable input", () => {
    expect(parsePlanAndSuite("")).toEqual({ planId: null, rootSuiteId: null });
    expect(parsePlanAndSuite("not an id")).toEqual({ planId: null, rootSuiteId: null });
  });

  it("returns plan id only when URL has planId but no suiteId", () => {
    const url = "https://dev.azure.com/x/y/_testPlans/define?planId=42";
    expect(parsePlanAndSuite(url)).toEqual({ planId: "42", rootSuiteId: null });
  });
});

describe("parseQueryIdentifier", () => {
  it("returns a bare GUID lower-cased", () => {
    expect(parseQueryIdentifier("766FB375-BEFE-4752-ADD8-4B2D692F9C45")).toBe(
      "766fb375-befe-4752-add8-4b2d692f9c45"
    );
  });

  it("extracts the GUID from a saved-query URL", () => {
    const url =
      "https://dev.azure.com/tensorfive/tensorfive/_queries/query/766fb375-befe-4752-add8-4b2d692f9c45/";
    expect(parseQueryIdentifier(url)).toBe("766fb375-befe-4752-add8-4b2d692f9c45");
  });

  it("returns null on input without a GUID", () => {
    expect(parseQueryIdentifier("not a guid")).toBeNull();
    expect(parseQueryIdentifier("")).toBeNull();
  });
});
