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

  it("calls order.move(draggedId, targetId, edge) on drop, deriving edge from cursor Y", () => {
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

    const items = harness.container.querySelectorAll<HTMLElement>("[data-work-item-id]");
    const sourceLi = items[0];
    const targetLi = items[1];
    expect(sourceLi).toBeDefined();
    expect(targetLi).toBeDefined();

    const sourceRect = { top: 0, height: 30 };
    const targetRect = { top: 30, height: 30 };
    sourceLi.getBoundingClientRect = () =>
      ({
        top: sourceRect.top,
        bottom: sourceRect.top + sourceRect.height,
        left: 0,
        right: 100,
        width: 100,
        height: sourceRect.height,
        x: 0,
        y: sourceRect.top,
        toJSON: () => ""
      }) as DOMRect;
    targetLi.getBoundingClientRect = () =>
      ({
        top: targetRect.top,
        bottom: targetRect.top + targetRect.height,
        left: 0,
        right: 100,
        width: 100,
        height: targetRect.height,
        x: 0,
        y: targetRect.top,
        toJSON: () => ""
      }) as DOMRect;

    const handle = sourceLi.querySelector<HTMLButtonElement>(".relations-view-drag-handle");
    expect(handle).not.toBeNull();

    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle!, "dragstart", { dataTransfer: dt });
    });
    act(() => {
      fireDrag(targetLi, "dragover", { dataTransfer: dt, clientY: 32 });
    });

    expect(targetLi.getAttribute("data-drop-edge")).toBe("before");

    act(() => {
      fireDrag(targetLi, "drop", { dataTransfer: dt, clientY: 32 });
    });

    expect(order.move).toHaveBeenCalledWith(501, 502, "before");
    expect(targetLi.getAttribute("data-drop-edge")).toBeNull();

    harness.unmount();
  });

  it("returns 'after' when the drop point is below the row midpoint", () => {
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

    const items = harness.container.querySelectorAll<HTMLElement>("[data-work-item-id]");
    const sourceLi = items[0];
    const targetLi = items[1];
    targetLi.getBoundingClientRect = () =>
      ({
        top: 30,
        bottom: 60,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 30,
        toJSON: () => ""
      }) as DOMRect;

    const handle = sourceLi.querySelector<HTMLButtonElement>(".relations-view-drag-handle")!;
    const dt = buildDataTransferStub();

    act(() => {
      fireDrag(handle, "dragstart", { dataTransfer: dt });
    });
    act(() => {
      fireDrag(targetLi, "drop", { dataTransfer: dt, clientY: 55 });
    });

    expect(order.move).toHaveBeenCalledWith(501, 502, "after");

    harness.unmount();
  });
});
