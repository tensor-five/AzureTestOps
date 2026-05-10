// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { FilterBar, toggleStringList, type FilterFacet } from "./filter-bar.js";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function render(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return container;
}

const STATE_FACET: FilterFacet = {
  kind: "states",
  label: "State",
  options: ["Active", "Closed"],
  selected: []
};

describe("FilterBar", () => {
  it("forwards title query changes verbatim", () => {
    const onTitleQueryChange = vi.fn();
    const container = render(
      <FilterBar
        ariaLabel="Test cases"
        titleQuery=""
        onTitleQueryChange={onTitleQueryChange}
        facets={[STATE_FACET]}
        onToggleFacetValue={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const input = container.querySelector<HTMLInputElement>(".filter-bar-title-input");
    expect(input).not.toBeNull();
    setReactInputValue(input!, "auth");
    expect(onTitleQueryChange).toHaveBeenCalledWith("auth");
  });

  it("invokes onToggleFacetValue with kind + option when a checkbox is toggled", () => {
    const onToggle = vi.fn();
    const container = render(
      <FilterBar
        ariaLabel="Test cases"
        titleQuery=""
        onTitleQueryChange={vi.fn()}
        facets={[STATE_FACET]}
        onToggleFacetValue={onToggle}
        onClear={vi.fn()}
      />
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      ".filter-bar-facet-option input"
    );
    expect(checkbox).not.toBeNull();
    act(() => {
      checkbox!.click();
    });
    expect(onToggle).toHaveBeenCalledWith("states", "Active");
  });

  it("renders Clear (n) only when at least one filter is active", () => {
    const onClear = vi.fn();
    const container = render(
      <FilterBar
        ariaLabel="Test cases"
        titleQuery="login"
        onTitleQueryChange={vi.fn()}
        facets={[{ ...STATE_FACET, selected: ["Active"] }]}
        onToggleFacetValue={vi.fn()}
        onClear={onClear}
      />
    );
    const button = container.querySelector<HTMLButtonElement>(".filter-bar-clear");
    expect(button?.textContent).toBe("Clear (2)");
    act(() => {
      button!.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("hides the clear button when no filter is active", () => {
    const container = render(
      <FilterBar
        ariaLabel="Test cases"
        titleQuery=""
        onTitleQueryChange={vi.fn()}
        facets={[STATE_FACET]}
        onToggleFacetValue={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(container.querySelector(".filter-bar-clear")).toBeNull();
  });
});

function setReactInputValue(input: HTMLInputElement, value: string): void {
  // React tracks the previous value on the DOM node; assigning via the
  // prototype setter is the documented way to bypass that and have the
  // synthetic onChange fire from a dispatched 'input' event.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("toggleStringList", () => {
  it("appends a value when missing", () => {
    expect(toggleStringList(["A"], "B")).toEqual(["A", "B"]);
  });

  it("removes a value when present", () => {
    expect(toggleStringList(["A", "B"], "A")).toEqual(["B"]);
  });

  it("treats undefined as an empty list", () => {
    expect(toggleStringList(undefined, "A")).toEqual(["A"]);
  });
});
