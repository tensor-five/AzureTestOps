// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useItemDragging } from "./use-item-dragging.js";

type DraggingApi = ReturnType<typeof useItemDragging<number>>;

function stubBounds(element: HTMLElement, top: number, height: number): void {
  element.getBoundingClientRect = () =>
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

describe("useItemDragging", () => {
  it("resolves vertical targets, marks only the preview and retains the last valid target", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const result = { current: null as DraggingApi | null };

    function Harness(): React.ReactElement {
      const containerRef = React.useRef<HTMLDivElement | null>(null);
      result.current = useItemDragging({
        containerRef,
        rowSelector: ":scope > [data-id]",
        readItem: (row) => {
          const id = Number.parseInt(row.dataset.id ?? "", 10);
          return Number.isInteger(id) ? id : null;
        }
      });
      return (
        <div ref={containerRef}>
          <div data-id="1" />
          <div data-id="2" />
          <div data-id="3" />
        </div>
      );
    }

    act(() => root.render(<Harness />));
    const rows = host.querySelectorAll<HTMLElement>("[data-id]");
    stubBounds(rows[0], 0, 20);
    stubBounds(rows[1], 20, 20);
    stubBounds(rows[2], 40, 20);

    expect(result.current!.previewAt(5)).toEqual({ item: 1, edge: "before" });
    expect(rows[0].getAttribute("data-drop-edge")).toBe("before");

    expect(result.current!.previewAt(35)).toEqual({ item: 2, edge: "after" });
    expect(rows[0].getAttribute("data-drop-edge")).toBeNull();
    expect(rows[1].getAttribute("data-drop-edge")).toBe("after");

    expect(result.current!.previewAt(45)).toEqual({ item: 3, edge: "before" });
    expect(rows[1].getAttribute("data-drop-edge")).toBeNull();
    expect(rows[2].getAttribute("data-drop-edge")).toBe("before");

    expect(result.current!.previewAt(Number.NaN)).toEqual({ item: 3, edge: "before" });
    expect(result.current!.getPreviewTarget()).toEqual({ item: 3, edge: "before" });

    result.current!.clearPreview();
    expect(result.current!.getPreviewTarget()).toBeNull();
    expect(rows[2].getAttribute("data-drop-edge")).toBeNull();

    act(() => root.unmount());
    host.remove();
  });

  it("invalidates a preview when a re-render removes its row from the visible container", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const result = { current: null as DraggingApi | null };

    function Harness(props: { visibleIds: readonly number[] }): React.ReactElement {
      const containerRef = React.useRef<HTMLDivElement | null>(null);
      result.current = useItemDragging({
        containerRef,
        rowSelector: ":scope > [data-id]",
        readItem: (row) => Number.parseInt(row.dataset.id ?? "", 10)
      });
      return (
        <div ref={containerRef}>
          {props.visibleIds.map((id) => <div key={id} data-id={id} />)}
        </div>
      );
    }

    act(() => root.render(<Harness visibleIds={[1, 2]} />));
    const targetRow = host.querySelector<HTMLElement>('[data-id="2"]')!;
    stubBounds(host.querySelector<HTMLElement>('[data-id="1"]')!, 0, 20);
    stubBounds(targetRow, 20, 20);
    expect(result.current!.previewAt(35)).toEqual({ item: 2, edge: "after" });

    act(() => root.render(<Harness visibleIds={[1, 3]} />));

    expect(result.current!.getPreviewTarget()).toBeNull();
    expect(targetRow.getAttribute("data-drop-edge")).toBeNull();

    act(() => root.unmount());
    host.remove();
  });

  it("keeps the marker while entering a child and clears it when leaving the container", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const result = { current: null as DraggingApi | null };

    function Harness(): React.ReactElement {
      const containerRef = React.useRef<HTMLDivElement | null>(null);
      result.current = useItemDragging({
        containerRef,
        rowSelector: ":scope > [data-id]",
        readItem: (row) => Number.parseInt(row.dataset.id ?? "", 10)
      });
      return (
        <div ref={containerRef} data-container="">
          <div data-id="1"><span data-child="" /></div>
        </div>
      );
    }

    act(() => root.render(<Harness />));
    const container = host.querySelector<HTMLElement>("[data-container]")!;
    const row = host.querySelector<HTMLElement>("[data-id]")!;
    const child = host.querySelector<HTMLElement>("[data-child]")!;
    stubBounds(row, 0, 20);
    result.current!.previewAt(5);

    result.current!.handleDragLeave({
      currentTarget: container,
      relatedTarget: child
    } as unknown as React.DragEvent<HTMLElement>);
    expect(row.getAttribute("data-drop-edge")).toBe("before");

    result.current!.handleDragLeave({
      currentTarget: container,
      relatedTarget: document.body
    } as unknown as React.DragEvent<HTMLElement>);
    expect(row.getAttribute("data-drop-edge")).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
