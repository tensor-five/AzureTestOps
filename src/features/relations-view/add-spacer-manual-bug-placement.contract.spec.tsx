// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetLayoutPreferenceForTests, setLayoutPreferenceStore } from "./set-layout-preference-store.js";
import { useMagicSortSpacerOption } from "./use-magic-sort-spacer-option.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";
import { WorkItemColumn, type WorkItemColumnProps } from "./work-item-column.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ManualPlacementProps = WorkItemColumnProps & {
  onSpacerPositionsChange(visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>): void;
};

const ManualPlacementColumn = WorkItemColumn as unknown as React.ComponentType<ManualPlacementProps>;
const relationsCss = await readFile(path.resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");
const spacerHeightRule = /\.relations-view-work-item-spacer\s*\{[^}]*min-height:\s*(?<height>[^;]+);/su.exec(relationsCss)?.groups?.height;

afterEach(() => {
  vi.restoreAllMocks();
  clearSetLayoutPreferenceForTests();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("Add Spacer manual Bug placement contract v1", () => {
  it("ASMB-01 keeps Bug reorder handles and keyboard movement available while Add Spacer is active", () => {
    const onSpacerPositionsChange = vi.fn();
    const harness = renderColumn(onSpacerPositionsChange);
    const handles = harness.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");

    expect(handles).toHaveLength(2);
    act(() => handles[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(onSpacerPositionsChange).toHaveBeenCalledWith([201, 202], { 201: 3, 202: 0 });

    harness.unmount();
  });

  it("ASMB-02 exposes every Spacer as a non-draggable non-Bug block", () => {
    const harness = renderColumn(vi.fn());
    const spacers = harness.host.querySelectorAll<HTMLElement>("[data-work-item-spacer]");

    expect(spacers).toHaveLength(2);
    spacers.forEach((spacer) => {
      expect(spacer.getAttribute("draggable")).not.toBe("true");
      expect(spacer.querySelector(".relations-view-drag-handle")).toBeNull();
      expect(spacer.querySelector(".relations-view-card-work-item")).toBeNull();
    });

    harness.unmount();
  });

  it("ASMB-03 previews and accepts drops above and below Bugs as well as fixed Spacers", () => {
    const onSpacerPositionsChange = vi.fn();
    const harness = renderColumn(onSpacerPositionsChange);
    const rows = harness.host.querySelectorAll<HTMLElement>("[data-work-item-id]");
    const spacers = harness.host.querySelectorAll<HTMLElement>("[data-work-item-spacer]");
    const spacer = spacers[0]!;
    const handles = harness.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    stubBounds(rows[0]!, 0, 30);
    stubBounds(spacer, 38, 20);
    stubBounds(spacers[1]!, 66, 20);
    stubBounds(rows[1]!, 94, 30);
    const transfer = buildDataTransferStub();

    act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(rows[0]!, "dragover", { dataTransfer: transfer, clientY: 5 }));
    expect(rows[0]?.getAttribute("data-drop-edge")).toBe("before");
    act(() => fireDrag(rows[0]!, "drop", { dataTransfer: transfer, clientY: 5 }));
    expect(onSpacerPositionsChange).toHaveBeenCalledWith([201, 202], { 201: 3, 202: 0 });

    act(() => fireDrag(handles[0]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(rows[1]!, "dragover", { dataTransfer: transfer, clientY: 122 }));
    expect(rows[1]?.getAttribute("data-drop-edge")).toBe("after");
    act(() => fireDrag(rows[1]!, "drop", { dataTransfer: transfer, clientY: 122 }));
    expect(onSpacerPositionsChange).toHaveBeenCalledWith([201, 202], { 201: 3, 202: 0 });

    act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(spacer, "dragover", { dataTransfer: transfer, clientY: 40 }));
    expect(spacer.hasAttribute("data-spacer-drop-target")).toBe(true);
    expect(spacer.getAttribute("data-drop-edge")).toBe("before");
    act(() => fireDrag(spacer, "drop", { dataTransfer: transfer, clientY: 40 }));
    expect(onSpacerPositionsChange).toHaveBeenCalledWith([201, 202], { 201: 3, 202: 0 });

    act(() => fireDrag(handles[0]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(spacers[1]!, "dragover", { dataTransfer: transfer, clientY: 84 }));
    expect(spacers[1]?.getAttribute("data-drop-edge")).toBe("after");
    act(() => fireDrag(spacers[1]!, "drop", { dataTransfer: transfer, clientY: 84 }));
    expect(onSpacerPositionsChange).toHaveBeenCalledWith([201, 202], { 201: 3, 202: 0 });

    harness.unmount();
  });

  it("ASMB-04 through ASMB-06 preserves fixed Spacer blocks and hidden positions across persistence and reload", () => {
    let preferences = {
      setLayouts: {
        "active-set": {
          magicSortAddSpacer: true,
          workItemSpacerPositions: { "201": 0, "202": 3, "203": 5 }
        }
      }
    };
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockImplementation(() => preferences);
    vi.spyOn(preferencesClient, "isUserPreferencesCacheAuthoritative").mockReturnValue(true);
    vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockImplementation((patch) => {
      preferences = { ...preferences, setLayouts: { ...preferences.setLayouts, ...patch.setLayouts } };
    });

    const first = renderPersistentHarness();
    const beforeBlocks = renderedSpacerBlocks(first.host);
    expect(spacerHeightRule).toBe("calc(var(--space-8) + var(--space-1))");
    expect(beforeBlocks).toEqual([
      { index: 1, heightRule: spacerHeightRule },
      { index: 2, heightRule: spacerHeightRule }
    ]);
    const handle = first.host.querySelector<HTMLButtonElement>(".relations-view-drag-handle");
    act(() => handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const moved = readPositions(first.host);
    expect(moved).toEqual({ 201: 3, 202: 0, 203: 5 });
    expect(spacerIndexes(moved)).toEqual([1, 2, 4]);
    expect(renderedSpacerBlocks(first.host)).toEqual(beforeBlocks);
    first.unmount();

    clearSetLayoutPreferenceForTests();
    const restored = renderPersistentHarness();
    expect(readPositions(restored.host)).toEqual({ 201: 3, 202: 0, 203: 5 });
    expect(renderedSpacerBlocks(restored.host)).toEqual(beforeBlocks);
    restored.unmount();
  });

  it("ASMB-07 retains the dense manual sort when Add Spacer is disabled", () => {
    const onSpacerPositionsChange = vi.fn();
    const order: WorkItemOrderApi = { sortByStoredOrder: (items) => items.slice(), move: vi.fn() };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<ManualPlacementColumn
      workItems={[workItem(201), workItem(202)]}
      unfilteredCount={2}
      order={order}
      addSpacer={false}
      onSpacerPositionsChange={onSpacerPositionsChange}
    />));

    act(() => host.querySelector<HTMLButtonElement>(".relations-view-drag-handle")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(order.move).toHaveBeenCalledWith(201, 202, "after", [201, 202]);
    expect(onSpacerPositionsChange).not.toHaveBeenCalled();

    act(() => root.unmount());
    host.remove();
  });
});

function renderColumn(onSpacerPositionsChange: ManualPlacementProps["onSpacerPositionsChange"]): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const order: WorkItemOrderApi = { sortByStoredOrder: (items) => items.slice(), move: vi.fn() };
  act(() => root.render(<ManualPlacementColumn
    workItems={[workItem(201), workItem(202)]}
    allWorkItems={[workItem(201), workItem(202), workItem(203)]}
    unfilteredCount={3}
    order={order}
    addSpacer
    workItemPositions={{ 201: 0, 202: 3, 203: 5 }}
    onSpacerPositionsChange={onSpacerPositionsChange}
  />));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}

function renderPersistentHarness(): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<PersistentHarness />));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}

function PersistentHarness(): React.ReactElement {
  const spacer = useMagicSortSpacerOption("active-set");
  const order: WorkItemOrderApi = { sortByStoredOrder: (items) => items.slice(), move: () => undefined };
  return <>
    <ManualPlacementColumn
      workItems={[workItem(201), workItem(202)]}
      allWorkItems={[workItem(201), workItem(202), workItem(203)]}
      unfilteredCount={3}
      order={order}
      addSpacer={spacer.addSpacer}
      workItemPositions={spacer.workItemPositions}
      onSpacerPositionsChange={spacer.applyVisiblePositions}
    />
    <output>{JSON.stringify(spacer.workItemPositions)}</output>
  </>;
}

function buildDataTransferStub(): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
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

function fireDrag(target: HTMLElement, type: string, init: { dataTransfer: DataTransfer; clientY?: number }): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: init.dataTransfer });
  Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
  target.dispatchEvent(event);
}

function stubBounds(element: HTMLElement, top: number, height: number): void {
  element.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => "" }) as DOMRect;
}

function spacerIndexes(positions: Readonly<Record<number, number>>): number[] {
  const occupied = new Set(Object.values(positions));
  const maximum = Math.max(...occupied);
  return Array.from({ length: maximum + 1 }, (_, index) => index).filter((index) => !occupied.has(index));
}

function renderedSpacerBlocks(host: HTMLElement): readonly { index: number; heightRule: string | undefined }[] {
  const children = [...host.querySelector<HTMLOListElement>(".relations-view-work-item-list")!.children];
  return children.flatMap((child, index) => child instanceof HTMLElement && child.hasAttribute("data-work-item-spacer")
    ? [{ index, heightRule: spacerHeightRule }]
    : []);
}

function readPositions(host: HTMLElement): Record<number, number> {
  const raw = host.querySelector("output")?.textContent ?? "{}";
  return Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, number>).map(([id, position]) => [Number(id), position]));
}

function workItem(id: number): WorkItem {
  return { id, workItemType: "Bug", title: `Bug ${id}`, state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] };
}
