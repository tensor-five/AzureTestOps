import { describe, expect, it } from "vitest";

import { buildAdoBaseUrl, buildWorkItemUrl } from "./azure-rest-client.js";

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

describe("buildWorkItemUrl", () => {
  it("appends the _workitems/edit path with the work item id", () => {
    expect(
      buildWorkItemUrl({ organization: "contoso", project: "delivery" }, 4711)
    ).toBe("https://dev.azure.com/contoso/delivery/_workitems/edit/4711");
  });

  it("inherits org/project encoding from buildAdoBaseUrl", () => {
    expect(
      buildWorkItemUrl({ organization: "contoso", project: "Test Project" }, 42)
    ).toBe("https://dev.azure.com/contoso/Test%20Project/_workitems/edit/42");
  });
});
