// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import { WorkItemColumn, type WorkItemColumnProps } from "./work-item-column.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewProps = WorkItemColumnProps & {
  spacerLayout: readonly (number | null)[];
  onSpacerTokenMove(sourceWorkItemId: number, targetTokenIndex: number): void;
};

const PreviewColumn = WorkItemColumn as unknown as React.ComponentType<PreviewProps>;
const relationsCss = await readFile(path.resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");

afterEach(() => document.body.replaceChildren());

describe("Spacer slot preview contract v1", () => {
  it("SSP-01 gives Bug rows and free Spacer slots the same height unit", () => {
    expect(relationsCss).toMatch(/\.relations-view-work-item-list-item,\s*\.relations-view-work-item-spacer\s*\{[^}]*min-height:\s*var\(--relations-view-work-item-slot-height\)/su);
  });

  it("SSP-02 and SSP-03 preview and accept leading, inner and trailing Spacer slots without changing their height", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const moves: Array<readonly [number, number]> = [];
    act(() => root.render(<PreviewColumn
      workItems={[bug(201), bug(202)]}
      allWorkItems={[bug(201), bug(202)]}
      unfilteredCount={2}
      order={{ sortByStoredOrder: (items) => items.slice(), move: () => undefined }}
      addSpacer
      spacerLayout={[null, 201, null, null, 202, null]}
      onSpacerTokenMove={(source, target) => moves.push([source, target])}
    />));
    const handles = host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    const slots = host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]");
    expect(slots).toHaveLength(4);
    const transfer = dataTransfer();
    slots.forEach((slot) => {
      act(() => fireDrag(handles[0]!, "dragstart", transfer));
      act(() => fireDrag(slot, "dragover", transfer));
      expect(slot.getAttribute("data-drop-preview")).toBe("true");
    });
    act(() => fireDrag(slots[2]!, "drop", transfer));
    expect(moves).toEqual([[201, 3]]);
    act(() => root.unmount());
  });

  it("SSP-04 leaves dense mode without Spacer markup", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<PreviewColumn workItems={[bug(201)]} unfilteredCount={1} addSpacer={false} spacerLayout={[null, 201]} onSpacerTokenMove={() => undefined} />));
    expect(host.querySelector("[data-spacer-slot-index]")).toBeNull();
    act(() => root.unmount());
  });
});

function bug(id: number): WorkItem { return { id, workItemType: "Bug", title: `Bug ${id}`, state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] }; }
function dataTransfer(): DataTransfer { const values = new Map<string, string>(); return { setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? "", setDragImage: () => undefined, effectAllowed: "all", dropEffect: "none", files: [] as unknown as FileList, items: [] as unknown as DataTransferItemList, types: [], clearData: () => undefined } as unknown as DataTransfer; }
function fireDrag(target: HTMLElement, type: string, transfer: DataTransfer): void { const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent; Object.defineProperty(event, "dataTransfer", { value: transfer }); target.dispatchEvent(event); }
