import { describe, expect, it } from "vitest";

import { AzureWorkItemDeepLinkAdapter } from "./azure-work-item-deep-link.adapter.js";

describe("AzureWorkItemDeepLinkAdapter", () => {
  const adapter = new AzureWorkItemDeepLinkAdapter();

  it("appends the _workitems/edit path with the work item id", () => {
    expect(
      adapter.buildHref({ organization: "contoso", project: "delivery" }, 4711)
    ).toBe("https://dev.azure.com/contoso/delivery/_workitems/edit/4711");
  });

  it("URL-encodes the project segment for project names containing spaces", () => {
    expect(
      adapter.buildHref({ organization: "contoso", project: "Test Project" }, 42)
    ).toBe("https://dev.azure.com/contoso/Test%20Project/_workitems/edit/42");
  });

  it("strips a fully-qualified org URL before re-applying the host", () => {
    expect(
      adapter.buildHref(
        { organization: "https://dev.azure.com/contoso/", project: "delivery" },
        9
      )
    ).toBe("https://dev.azure.com/contoso/delivery/_workitems/edit/9");
  });
});
