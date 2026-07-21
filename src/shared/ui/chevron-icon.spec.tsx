// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ChevronIcon } from "./chevron-icon.js";

describe("ChevronIcon", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders one reusable SVG and exposes its rotation direction", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ChevronIcon direction="right" className="example-chevron" />);
    });

    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("data-direction")).toBe("right");
    expect(icon?.classList.contains("u-chevron-icon")).toBe(true);
    expect(icon?.classList.contains("example-chevron")).toBe(true);
    expect(icon?.textContent).toBe("");

    act(() => root.unmount());
  });
});
