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

function render(ui: React.ReactElement): {
  container: HTMLDivElement;
  rerender(next: React.ReactElement): void;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender: (next) => {
      act(() => {
        root.render(next);
      });
    },
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
    expect(order.move).toHaveBeenCalledWith(503, 501, "before", [501, 502, 503]);

    harness.unmount();
  });

  it("drops anywhere on the list — cursor in the gap resolves after the preceding row", () => {
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
    // Cursor sits in the visual gap after row 1.
    act(() => {
      fireDrag(ol, "dragover", { dataTransfer: dt, clientY: 75 });
    });
    expect(items[1].getAttribute("data-drop-edge")).toBe("after");
    expect(items[0].getAttribute("data-drop-edge")).toBeNull();
    expect(items[2].getAttribute("data-drop-edge")).toBeNull();

    act(() => {
      fireDrag(ol, "drop", { dataTransfer: dt, clientY: 75 });
    });
    expect(order.move).toHaveBeenCalledWith(501, 502, "after", [501, 502, 503]);

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
    expect(order.move).toHaveBeenCalledWith(501, 503, "after", [501, 502, 503]);

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

  it("drops at the last previewed target and includes filtered-out ids in the move", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };
    const allWorkItems = Array.from({ length: 8 }, (_, index) =>
      workItem({ id: index + 1, title: `Item ${index + 1}` })
    );

    const harness = render(
      <WorkItemColumn
        workItems={[allWorkItems[1], allWorkItems[7]]}
        allWorkItems={allWorkItems}
        unfilteredCount={8}
        order={order}
      />
    );

    const list = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const rows = list.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const handle = rows[0].querySelector<HTMLButtonElement>(
      ".relations-view-drag-handle"
    )!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
      fireDrag(list, "dragover", { dataTransfer: dt, clientY: 100 });
    });
    expect(rows[1].getAttribute("data-drop-edge")).toBe("after");

    act(() => {
      // Native drop coordinates can differ from the last dragover coordinates.
      fireDrag(list, "drop", { dataTransfer: dt, clientY: 0 });
    });
    expect(order.move).toHaveBeenCalledWith(2, 8, "after", [1, 2, 3, 4, 5, 6, 7, 8]);

    harness.unmount();
  });

  it("keeps an after target on the lower half of a filtered visible row", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };
    const allWorkItems = Array.from({ length: 8 }, (_, index) =>
      workItem({ id: index + 1, title: `Item ${index + 1}` })
    );
    const harness = render(
      <WorkItemColumn
        workItems={[allWorkItems[1], allWorkItems[7]]}
        allWorkItems={allWorkItems}
        unfilteredCount={8}
        order={order}
      />
    );
    const list = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const rows = list.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    const handle = rows[1].querySelector<HTMLButtonElement>(".relations-view-drag-handle")!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
      fireDrag(list, "dragover", { dataTransfer: dt, clientY: 25 });
      fireDrag(list, "drop", { dataTransfer: dt, clientY: 25 });
    });

    expect(order.move).toHaveBeenCalledWith(8, 2, "after", [1, 2, 3, 4, 5, 6, 7, 8]);
    harness.unmount();
  });

  it("invalidates a preview when filtering removes its target before drop", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };
    const initial = [workItem({ id: 1 }), workItem({ id: 2 }), workItem({ id: 3 })];
    const harness = render(
      <WorkItemColumn workItems={initial} allWorkItems={initial} unfilteredCount={3} order={order} />
    );
    const list = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    const rows = list.querySelectorAll<HTMLElement>("[data-work-item-id]");
    stubBounds(rows[0], 0, 30);
    stubBounds(rows[1], 30, 30);
    stubBounds(rows[2], 60, 30);
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(rows[0].querySelector<HTMLElement>(".relations-view-drag-handle")!, "dragstart", {
        dataTransfer: dt
      });
      fireDrag(list, "dragover", { dataTransfer: dt, clientY: 45 });
    });
    expect(rows[1].getAttribute("data-drop-edge")).toBe("after");

    const filtered = [initial[0], initial[2]];
    harness.rerender(
      <WorkItemColumn
        workItems={filtered}
        allWorkItems={filtered}
        unfilteredCount={2}
        order={order}
      />
    );
    const currentList = harness.container.querySelector<HTMLOListElement>(
      ".relations-view-work-item-list"
    )!;
    act(() => {
      fireDrag(currentList, "drop", { dataTransfer: dt });
    });

    expect(order.move).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("supports ArrowUp and ArrowDown on each reorder handle", () => {
    const order: WorkItemOrderApi = {
      sortByStoredOrder: (items) => items.slice(),
      move: vi.fn()
    };
    const allWorkItems = Array.from({ length: 8 }, (_, index) => workItem({ id: index + 1 }));
    const harness = render(
      <WorkItemColumn
        workItems={[allWorkItems[1], allWorkItems[7]]}
        allWorkItems={allWorkItems}
        unfilteredCount={8}
        order={order}
      />
    );
    const handle = harness.container.querySelector<HTMLButtonElement>(
      '[data-work-item-id="8"] .relations-view-drag-handle'
    )!;

    handle.focus();
    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });

    expect(order.move).toHaveBeenCalledWith(8, 2, "before", [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(handle.getAttribute("aria-keyshortcuts")).toBe("ArrowUp ArrowDown");
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(handle);
    expect(harness.container.querySelector('[role="status"]')?.textContent).toContain(
      "Moved work item #8 before work item #2"
    );

    harness.unmount();
  });
});
