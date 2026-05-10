import { describe, expect, it } from "vitest";

import { buildAdoBaseUrl } from "./azure-rest-client.js";

describe("buildAdoBaseUrl", () => {
  it("returns dev.azure.com prefix for plain org names", () => {
    expect(buildAdoBaseUrl({ organization: "contoso", project: "delivery" })).toBe(
      "https://dev.azure.com/contoso/delivery"
    );
  });

  it("strips an existing dev.azure.com URL prefix", () => {
    expect(
      buildAdoBaseUrl({ organization: "https://dev.azure.com/contoso/", project: "delivery" })
    ).toBe("https://dev.azure.com/contoso/delivery");
  });

  it("URL-encodes project names with spaces", () => {
    expect(buildAdoBaseUrl({ organization: "contoso", project: "Test Project" })).toBe(
      "https://dev.azure.com/contoso/Test%20Project"
    );
  });
});
