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
  act(() => root.render(node));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

const STATE_FACET: FilterFacet = {
  kind: "states",
  label: "State",
  options: [
    { value: "Active", count: 4 },
    { value: "Closed", count: 2 }
  ],
  selected: []
};

function bar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}): React.ReactElement {
  return (
    <FilterBar
      ariaLabel="Test cases"
      titleQuery=""
      onTitleQueryChange={vi.fn()}
      facets={[STATE_FACET]}
      onToggleFacetValue={vi.fn()}
      onReplaceFacetValues={vi.fn()}
      onClear={vi.fn()}
      {...overrides}
    />
  );
}

describe("FilterBar", () => {
  it("forwards search changes and clears the query from the inline button", () => {
    const onTitleQueryChange = vi.fn();
    const container = render(bar({ titleQuery: "login", onTitleQueryChange }));
    const input = container.querySelector<HTMLInputElement>(".filter-bar-title-input")!;
    setReactInputValue(input, "auth");
    expect(onTitleQueryChange).toHaveBeenCalledWith("auth");

    act(() => container.querySelector<HTMLButtonElement>(".filter-bar-search-clear")?.click());
    expect(onTitleQueryChange).toHaveBeenCalledWith("");
  });

  it("expands facets and forwards checkbox toggles", () => {
    const onToggle = vi.fn();
    const container = render(bar({ onToggleFacetValue: onToggle }));
    act(() => container.querySelector<HTMLButtonElement>(".filter-bar-toggle")?.click());
    const checkbox = container.querySelector<HTMLInputElement>(
      ".filter-bar-facet-option input"
    )!;
    act(() => checkbox.click());
    expect(onToggle).toHaveBeenCalledWith("states", "Active");
    expect(container.querySelector(".filter-bar-facet-option-count")?.textContent).toBe("4");
  });

  it("renders removable active chips and clears all filters", () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    const container = render(bar({
      titleQuery: "login",
      facets: [{ ...STATE_FACET, selected: ["Active"] }],
      onToggleFacetValue: onToggle,
      onClear
    }));

    const chip = container.querySelector<HTMLButtonElement>(".filter-bar-active-chip")!;
    act(() => chip.click());
    expect(onToggle).toHaveBeenCalledWith("states", "Active");

    const clear = container.querySelector<HTMLButtonElement>(".filter-bar-clear")!;
    expect(clear.textContent).toBe("Clear all");
    act(() => clear.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("searches facet values and selects all visible matches", () => {
    const onReplace = vi.fn();
    const container = render(bar({ onReplaceFacetValues: onReplace }));
    act(() => container.querySelector<HTMLButtonElement>(".filter-bar-toggle")?.click());
    setReactInputValue(
      container.querySelector<HTMLInputElement>(".filter-bar-facet-search")!,
      "clo"
    );
    act(() => container.querySelector<HTMLButtonElement>(".filter-bar-facet-bulk")?.click());
    expect(onReplace).toHaveBeenCalledWith("states", ["Closed"]);
  });

  it("shows active quick filters both as controls and removable chips", () => {
    const onToggle = vi.fn();
    const container = render(bar({
      quickActions: [{ id: "linked", label: "Only linked", pressed: true, onToggle }]
    }));
    expect(container.querySelector(".filter-bar-active-chip")?.textContent).toContain("Only linked");
    act(() => container.querySelector<HTMLButtonElement>(".filter-bar-active-chip")?.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a quick-action alias for an active facet", () => {
    const container = render(bar({
      facets: [{
        kind: "lastOutcomes",
        label: "Outcome",
        options: [{ value: "Failed", count: 2 }],
        selected: ["Failed"]
      }],
      quickActions: [{
        id: "failed-tests",
        label: "Failed tests",
        pressed: true,
        showActiveChip: false,
        onToggle: vi.fn()
      }]
    }));

    expect(container.querySelector(".filter-bar-toggle-count")?.textContent).toBe("1");
    expect([...container.querySelectorAll(".filter-bar-active-chip")].map((chip) => chip.textContent))
      .toEqual(["Failed×"]);
  });
});

function setReactInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

describe("toggleStringList", () => {
  it("appends, removes and seeds values", () => {
    expect(toggleStringList(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleStringList(["A", "B"], "A")).toEqual(["B"]);
    expect(toggleStringList(undefined, "A")).toEqual(["A"]);
  });
});
