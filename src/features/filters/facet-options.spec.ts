import { describe, expect, it } from "vitest";

import { buildFacetOptions } from "./facet-options.js";

describe("buildFacetOptions", () => {
  it("counts rows once per distinct value and keeps the requested order", () => {
    const options = buildFacetOptions(
      ["Active", "Closed", "Missing"],
      [
        { states: ["Active", "Active"] },
        { states: ["Closed"] },
        { states: ["Active", "Closed"] }
      ],
      (row) => row.states
    );

    expect(options).toEqual([
      { value: "Active", count: 2 },
      { value: "Closed", count: 2 },
      { value: "Missing", count: 0 }
    ]);
  });
});
