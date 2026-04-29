import { describe, expect, it } from "vitest";

import { parseAdoCliDefaults } from "./parse-ado-defaults.js";

describe("parseAdoCliDefaults", () => {
  it("parses organization (URL form) and project from the INI block", () => {
    const stdout =
      "[defaults]\n" +
      "organization = https://dev.azure.com/contoso\n" +
      "project = Delivery\n";

    expect(parseAdoCliDefaults(stdout)).toEqual({
      organization: "contoso",
      project: "Delivery"
    });
  });

  it("preserves the original casing of the organization slug", () => {
    const stdout =
      "[defaults]\n" +
      "organization = https://dev.azure.com/IngEurCdaas01\n" +
      "project = IngOne\n";

    expect(parseAdoCliDefaults(stdout)).toEqual({
      organization: "IngEurCdaas01",
      project: "IngOne"
    });
  });

  it("falls back to empty strings when keys are missing", () => {
    expect(parseAdoCliDefaults("[defaults]\nUse git alias = No\n")).toEqual({
      organization: "",
      project: ""
    });
  });

  it("strips a trailing slash on the organization URL", () => {
    expect(parseAdoCliDefaults("organization = https://dev.azure.com/contoso/").organization).toBe(
      "contoso"
    );
  });

  it("accepts an organization stored as a bare slug (no URL)", () => {
    expect(parseAdoCliDefaults("organization = contoso").organization).toBe("contoso");
  });
});
