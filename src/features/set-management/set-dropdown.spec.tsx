// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { SetDropdown } from "./set-dropdown.js";

describe("SetDropdown", () => {
  it("rotates the SVG chevron when the menu opens", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SetDropdown
          sets={[]}
          activeSetId={null}
          isLoading={false}
          onSelect={vi.fn()}
          onManageSets={vi.fn()}
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(".set-dropdown-trigger")!;
    expect(trigger.querySelector(".u-chevron-icon")?.getAttribute("data-direction")).toBe("down");

    act(() => trigger.click());

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.querySelector(".u-chevron-icon")?.getAttribute("data-direction")).toBe("up");

    act(() => root.unmount());
    container.remove();
  });
});
