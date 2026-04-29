// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { SetManagerList } from "./set-manager-list.js";

import type { Set } from "../../domain/sets/set.js";

function mountList(props: React.ComponentProps<typeof SetManagerList>): { container: HTMLDivElement; unmount(): void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SetManagerList {...props} />);
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

const sampleSet: Set = {
  id: "abc",
  name: "Sprint 24",
  planId: "9",
  rootSuiteId: "1",
  queryId: "Q-A",
  planName: "Plan Alpha",
  queryName: "Open Bugs"
};

describe("SetManagerList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an empty-state hint when no sets exist", () => {
    const harness = mountList({
      sets: [],
      activeSetId: null,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onSetActive: vi.fn()
    });

    expect(harness.container.textContent).toContain("No sets yet");
    harness.unmount();
  });

  it("invokes onSetActive(null) when toggling off the active set", () => {
    const onSetActive = vi.fn(async () => undefined);
    const harness = mountList({
      sets: [sampleSet],
      activeSetId: "abc",
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onSetActive
    });

    const button = Array.from(harness.container.querySelectorAll("button")).find(
      (entry) => entry.textContent === "Deactivate"
    );
    expect(button).toBeDefined();

    act(() => {
      button?.click();
    });

    expect(onSetActive).toHaveBeenCalledWith(null);
    harness.unmount();
  });

  it("respects the confirmDelete hook before calling onDelete", () => {
    const onDelete = vi.fn(async () => undefined);
    const confirmDelete = vi.fn(() => false);

    const harness = mountList({
      sets: [sampleSet],
      activeSetId: null,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onDelete,
      onSetActive: vi.fn(),
      confirmDelete
    });

    const deleteBtn = Array.from(harness.container.querySelectorAll("button")).find(
      (entry) => entry.textContent === "Delete"
    );
    act(() => {
      deleteBtn?.click();
    });

    expect(confirmDelete).toHaveBeenCalledWith('Delete set "Sprint 24"?');
    expect(onDelete).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("delegates to onCreate when the New-set button is clicked", () => {
    const onCreate = vi.fn();
    const harness = mountList({
      sets: [sampleSet],
      activeSetId: null,
      onCreate,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onSetActive: vi.fn()
    });

    const button = Array.from(harness.container.querySelectorAll("button")).find(
      (entry) => entry.textContent === "New set"
    );
    act(() => {
      button?.click();
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    harness.unmount();
  });
});
