import { describe, expect, it } from "vitest";

import { AzureTestSuiteDeepLinkAdapter } from "./azure-test-suite-deep-link.adapter.js";

describe("AzureTestSuiteDeepLinkAdapter", () => {
  const adapter = new AzureTestSuiteDeepLinkAdapter();

  it("builds the Test Management results-page link for a plan and suite", () => {
    expect(
      adapter.buildHref({ organization: "contoso", project: "delivery" }, 42, 99)
    ).toBe(
      "https://dev.azure.com/contoso/delivery/_testPlans/execute?view=_TestManagement&planId=42&suiteId=99"
    );
  });

  it("URL-encodes the project segment and trims identifiers", () => {
    expect(
      adapter.buildHref({ organization: "contoso", project: "Test Project" }, " 7 ", " 11 ")
    ).toBe(
      "https://dev.azure.com/contoso/Test%20Project/_testPlans/execute?view=_TestManagement&planId=7&suiteId=11"
    );
  });
});
