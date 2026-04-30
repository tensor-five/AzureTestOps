// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { WorkItemColumn } from "./work-item-column.js";
import type { WorkItem } from "../../domain/work-items/work-item.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 501,
    workItemType: "Bug",
    title: "Item",
    state: "Active",
    assignedTo: null,
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

function buildDataTransferStub(): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    getData: (type: string) => data.get(type) ?? "",
    setDragImage: () => undefined,
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: () => undefined
  } as unknown as DataTransfer;
}

function fireDrag(
  target: HTMLElement,
  type: string,
  init: { dataTransfer: DataTransfer; clientY?: number }
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: init.dataTransfer,
    enumerable: true
  });
  Object.defineProperty(event, "clientY", {
    value: init.clientY ?? 0,
    enumerable: true
  });
  Object.defineProperty(event, "clientX", { value: 0, enumerable: true });
  target.dispatchEvent(event);
  return event;
}

function stubBounds(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON: () => ""
    }) as DOMRect;
}

describe("WorkItemColumn drag-and-drop reorder", () => {
  it("falls back to id-ascending sort when no order api is provided", () => {
    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 503 }), workItem({ id: 501 }), workItem({ id: 502 })]}
        unfilteredCount={3}
      />
    );

    const ids = [...harness.container.querySelectorAll("[data-work-item-id]")].map((el) =>
      el.getAttribute("data-work-item-id")
    );
    expect(ids).toEqual(["501", "502", "503"]);
    expect(harness.container.querySelector(".relations-view-drag-handle")).toBeNull();

    harness.unmount();
  });

  it("uses the order api to sort items and renders a drag handle per row", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => [...items].sort((a, b) => b.id - a.id),
      move: vi.fn()
    };

    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 501 }), workItem({ id: 502 }), workItem({ id: 503 })]}
        unfilteredCount={3}
        order={order}
      />
    );

    const ids = [...harness.container.querySelectorAll("[data-work-item-id]")].map((el) =>
      el.getAttribute("data-work-item-id")
    );
    expect(ids).toEqual(["503", "502", "501"]);

    const handles = harness.container.querySelectorAll(".relations-view-drag-handle");
    expect(handles).toHaveLength(3);
    handles.forEach((handle) => {
      expect(handle.getAttribute("draggable")).toBe("true");
    });

    harness.unmount();
  });

  it("drops anywhere on the list — cursor above the first row inserts before it", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };

    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 501 }), workItem({ id: 502 }), workItem({ id: 503 })]}
        unfilteredCount={3}
        order={order}
      />
    );

    const ol = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const items = ol.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(items[0], 30, 30);
    stubBounds(items[1], 60, 30);
    stubBounds(items[2], 90, 30);

    const handle = items[2].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    // Cursor far above row 0 — should target row 0 with edge "before".
    act(() => {
      fireDrag(ol, "dragover", { dataTransfer: dt, clientY: 5 });
    });
    expect(items[0].getAttribute("data-drop-edge")).toBe("before");

    act(() => {
      fireDrag(ol, "drop", { dataTransfer: dt, clientY: 5 });
    });
    expect(order.move).toHaveBeenCalledWith(503, 501, "before");

    harness.unmount();
  });

  it("drops anywhere on the list — cursor in the gap between rows resolves to the right side", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };

    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 501 }), workItem({ id: 502 }), workItem({ id: 503 })]}
        unfilteredCount={3}
        order={order}
      />
    );

    const ol = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const items = ol.querySelectorAll<HTMLElement>("[data-work-item-id]");
    // Three rows: 0..30, 40..70, 80..110. Gaps at 30..40 and 70..80.
    stubBounds(items[0], 0, 30);
    stubBounds(items[1], 40, 30);
    stubBounds(items[2], 80, 30);

    const handle = items[0].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    // Cursor sits in the visual gap between row 1 (mid 55) and row 2 (mid 95).
    // It is past row 1's midpoint but before row 2's midpoint, so the
    // closest insertion point is "before row 2".
    act(() => {
      fireDrag(ol, "dragover", { dataTransfer: dt, clientY: 75 });
    });
    expect(items[2].getAttribute("data-drop-edge")).toBe("before");
    expect(items[0].getAttribute("data-drop-edge")).toBeNull();
    expect(items[1].getAttribute("data-drop-edge")).toBeNull();

    act(() => {
      fireDrag(ol, "drop", { dataTransfer: dt, clientY: 75 });
    });
    expect(order.move).toHaveBeenCalledWith(501, 503, "before");

    harness.unmount();
  });

  it("drops anywhere on the list — cursor below the last row appends after it", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };

    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 501 }), workItem({ id: 502 }), workItem({ id: 503 })]}
        unfilteredCount={3}
        order={order}
      />
    );

    const ol = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const items = ol.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(items[0], 0, 30);
    stubBounds(items[1], 30, 30);
    stubBounds(items[2], 60, 30);

    const handle = items[0].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    // Cursor far below the last row — append after it.
    act(() => {
      fireDrag(ol, "dragover", { dataTransfer: dt, clientY: 500 });
    });
    expect(items[2].getAttribute("data-drop-edge")).toBe("after");

    act(() => {
      fireDrag(ol, "drop", { dataTransfer: dt, clientY: 500 });
    });
    expect(order.move).toHaveBeenCalledWith(501, 503, "after");

    harness.unmount();
  });

  it("clears the drop edge marker on drag end so it does not linger", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };

    const harness = render(
      <WorkItemColumn
        workItems={[workItem({ id: 501 }), workItem({ id: 502 })]}
        unfilteredCount={2}
        order={order}
      />
    );

    const ol = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const items = ol.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(items[0], 0, 30);
    stubBounds(items[1], 30, 30);

    const handle = items[0].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    act(() => {
      fireDrag(ol, "dragover", { dataTransfer: dt, clientY: 45 });
    });
    expect(items[1].getAttribute("data-drop-edge")).toBe("after");

    act(() => {
      fireDrag(handle, "dragend", { dataTransfer: dt });
    });
    expect(items[1].getAttribute("data-drop-edge")).toBeNull();

    harness.unmount();
  });
});
