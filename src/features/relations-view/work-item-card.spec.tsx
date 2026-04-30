// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

import { WorkItemCard } from "./work-item-card.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 501,
    workItemType: "Bug",
    title: "Login redirect loops on stale session",
    state: "Active",
    assignedTo: "alice",
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    ...overrides
  };
}

function render(ui: React.ReactElement): { container: HTMLDivElement; unmount(): void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("WorkItemCard", () => {
  it("renders the state as a visible chip with a slug-derived class", () => {
    const harness = render(<WorkItemCard workItem={workItem({ state: "Active" })} />);

    const chip = harness.container.querySelector(".relations-view-state-chip");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("Active");
    expect(chip?.classList.contains("relations-view-state-chip-active")).toBe(true);
    expect(chip?.getAttribute("aria-label")).toBe("State: Active");

    harness.unmount();
  });

  it("falls back to a placeholder dash and 'unknown' slug for empty state", () => {
    const harness = render(<WorkItemCard workItem={workItem({ state: "" })} />);

    const chip = harness.container.querySelector(".relations-view-state-chip");
    expect(chip?.textContent).toBe("—");
    expect(chip?.classList.contains("relations-view-state-chip-unknown")).toBe(true);

    harness.unmount();
  });

  it("slugifies multi-word states like 'In Progress'", () => {
    const harness = render(<WorkItemCard workItem={workItem({ state: "In Progress" })} />);

    const chip = harness.container.querySelector(".relations-view-state-chip");
    expect(chip?.textContent).toBe("In Progress");
    expect(chip?.classList.contains("relations-view-state-chip-in-progress")).toBe(true);

    harness.unmount();
  });

  it("renders the id as an external link when getWorkItemHref returns a URL", () => {
    const harness = render(
      <WorkItemCard
        workItem={workItem({ id: 4711 })}
        getWorkItemHref={(id) => `https://dev.azure.com/contoso/delivery/_workitems/edit/${id}`}
      />
    );

    const anchor = harness.container.querySelector<HTMLAnchorElement>("a.relations-view-card-id");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe(
      "https://dev.azure.com/contoso/delivery/_workitems/edit/4711"
    );
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(anchor?.textContent).toBe("#4711");

    harness.unmount();
  });

  it("falls back to a plain span when no link builder is provided", () => {
    const harness = render(<WorkItemCard workItem={workItem({ id: 4711 })} />);

    expect(harness.container.querySelector("a.relations-view-card-id")).toBeNull();
    expect(harness.container.querySelector("span.relations-view-card-id")?.textContent).toBe("#4711");

    harness.unmount();
  });
});
