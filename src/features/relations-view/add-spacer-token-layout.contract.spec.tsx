// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkItem } from "../../domain/work-items/work-item.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { useMagicSortSpacerOption } from "./use-magic-sort-spacer-option.js";
import type { WorkItemOrderApi } from "./use-work-item-order.js";
import { WorkItemColumn, type WorkItemColumnProps } from "./work-item-column.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SpacerToken = number | null;

type TokenLayoutProps = WorkItemColumnProps & {
  spacerLayout: readonly SpacerToken[];
  onSpacerTokenMove(sourceWorkItemId: number, targetTokenIndex: number): void;
};

type TokenLayoutApi = {
  addSpacer: boolean;
  spacerLayout: readonly SpacerToken[];
  moveVisibleWorkItemToSpacerSlot(sourceWorkItemId: number, targetTokenIndex: number): void;
  applyVisiblePositions(visibleIds: readonly number[], nextPositions: Readonly<Record<number, number>>): void;
};

const TokenLayoutColumn = WorkItemColumn as unknown as React.ComponentType<TokenLayoutProps>;
const relationsCss = await readFile(path.resolve("src/app/bootstrap/local-ui-relations.css"), "utf8");
const spacerHeightRule = /\.relations-view-work-item-spacer\s*\{[^}]*min-height:\s*(?<height>[^;]+);/su.exec(relationsCss)?.groups?.height;

afterEach(() => {
  vi.restoreAllMocks();
  clearSetLayoutPreferenceForTests();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("Add Spacer token layout contract v1", () => {
  it("ASTL-01 renders the visible Bug stack from Bug references and free Spacer slots without duplicate Bug cards", () => {
    const harness = renderTokenColumn();

    expect(renderedTokens(harness.host)).toEqual([201, null, 203, null, 202]);
    expect(harness.host.querySelectorAll("[data-work-item-id]")).toHaveLength(3);
    expect(harness.host.querySelectorAll(".relations-view-card-work-item")).toHaveLength(3);
    expect(harness.host.querySelectorAll("[data-spacer-slot-index]")).toHaveLength(2);

    harness.unmount();
  });

  it("ASTL-02 through ASTL-04 moves a Bug onto the exact free slot between two fixed Spacer blocks and previews it", () => {
    mockPreferences({
      "active-set": {
        magicSortAddSpacer: true,
        workItemSpacerPositions: { "201": 0, "202": 4, "203": 3 }
      }
    });
    const harness = renderPersistentTokenHarness();
    const handles = harness.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    const slots = harness.host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]");
    const targetSlot = slots[1]!;
    const transfer = buildDataTransferStub();

    expect(readLayout(harness.host)).toEqual([201, null, null, 203, 202]);
    expect(slots).toHaveLength(2);
    slots.forEach((slot) => {
      act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
      act(() => fireDrag(slot, "dragover", { dataTransfer: transfer }));
      expect(slot.getAttribute("data-drop-preview")).toBe("true");
      expect(slot.getAttribute("draggable")).not.toBe("true");
      expect(slot.querySelector(".relations-view-drag-handle")).toBeNull();
      act(() => fireDrag(slot, "dragleave", { dataTransfer: transfer }));
    });

    act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(targetSlot, "dragover", { dataTransfer: transfer }));
    act(() => fireDrag(targetSlot, "drop", { dataTransfer: transfer }));
    expect(readLayout(harness.host)).toEqual([201, null, 203, null, 202]);
    expect(renderedTokens(harness.host)).toEqual([201, null, 203, null, 202]);
    expect(renderedSpacerSlots(harness.host)).toHaveLength(2);
    expect(renderedSpacerSlots(harness.host).every((slot) => slot.classList.contains("relations-view-work-item-spacer"))).toBe(true);
    expect(spacerHeightRule).toBe("calc(var(--space-8) + var(--space-1))");

    harness.unmount();
  });

  it("ASTL-05 persists the token stack per Set and migrates legacy Spacer positions without losing slots", () => {
    mockPreferences({
      "active-set": {
        magicSortAddSpacer: true,
        workItemSpacerPositions: { "201": 0, "202": 4, "203": 2 }
      },
      "other-set": {
        magicSortAddSpacer: false,
        workItemSpacerLayout: [201, null, 202]
      }
    });

    const first = renderPersistentTokenHarness();
    expect(readLayout(first.host)).toEqual([201, null, 203, null, 202]);
    expect(readAddSpacer(first.host)).toBe(true);
    act(() => first.host.querySelector<HTMLButtonElement>("[data-token-layout-move]")?.click());
    expect(readLayout(first.host)).toEqual([201, 202, 203, null, null]);
    expect(renderedTokens(first.host)).toEqual([201, 202, 203, null, null]);
    const trailingSlots = first.host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]");
    const handles = first.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    const transfer = buildDataTransferStub();
    expect(trailingSlots).toHaveLength(2);
    act(() => fireDrag(handles[0]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(trailingSlots[1]!, "dragover", { dataTransfer: transfer }));
    expect(trailingSlots[1]?.getAttribute("data-drop-preview")).toBe("true");
    act(() => fireDrag(trailingSlots[1]!, "drop", { dataTransfer: transfer }));
    expect(readLayout(first.host)).toEqual([null, 202, 203, null, 201]);
    first.unmount();

    clearSetLayoutPreferenceForTests();
    const otherSet = renderPersistentTokenHarness({ setId: "other-set" });
    expect(readAddSpacer(otherSet.host)).toBe(false);
    expect(readLayout(otherSet.host)).toEqual([201, null, 202]);
    otherSet.unmount();

    clearSetLayoutPreferenceForTests();
    const restored = renderPersistentTokenHarness();
    expect(readLayout(restored.host)).toEqual([null, 202, 203, null, 201]);
    expect(readAddSpacer(restored.host)).toBe(true);
    restored.unmount();
  });

  it("ASTL-06 changes only visible Bugs and slots while filtered-out Bug tokens stay intact", () => {
    mockPreferences({
      "active-set": {
        magicSortAddSpacer: true,
        workItemSpacerLayout: [201, null, 203, null, 202]
      }
    });
    const harness = renderPersistentTokenHarness({ visibleWorkItems: [workItem(201), workItem(202)] });

    expect(renderedTokens(harness.host)).toEqual([201, null, null, 202]);
    expect(harness.host.querySelector('[data-work-item-id="203"]')).toBeNull();
    act(() => harness.host.querySelector<HTMLButtonElement>("[data-token-layout-move]")?.click());
    expect(readLayout(harness.host)).toEqual([201, 202, 203, null, null]);
    harness.unmount();

    clearSetLayoutPreferenceForTests();
    const restored = renderPersistentTokenHarness({ visibleWorkItems: [workItem(201), workItem(202)] });
    expect(readLayout(restored.host)).toEqual([201, 202, 203, null, null]);
    expect(restored.host.querySelector('[data-work-item-id="203"]')).toBeNull();

    restored.unmount();
  });

  it("ASTL-06 preserves every visible Bug when Magic Sort targets a slot occupied by a filtered-out Bug", () => {
    mockPreferences({
      "active-set": {
        magicSortAddSpacer: true,
        workItemSpacerLayout: [201, null, 203, 202]
      }
    });
    const harness = renderPersistentTokenHarness({ visibleWorkItems: [workItem(201), workItem(202)] });

    act(() => harness.host.querySelector<HTMLButtonElement>("[data-token-layout-magic-sort]")?.click());
    const layout = readLayout(harness.host);
    expect(layout).toContain(201);
    expect(layout).toContain(202);
    expect(layout[2]).toBe(203);

    harness.unmount();
  });

  it("ASTL-07 keeps dense manual ordering when Add Spacer is disabled", () => {
    const order: WorkItemOrderApi = { sortByStoredOrder: (items) => items.slice(), move: vi.fn() };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<TokenLayoutColumn
      workItems={[workItem(201), workItem(202)]}
      unfilteredCount={2}
      order={order}
      addSpacer={false}
      spacerLayout={[201, null, 202]}
      onSpacerTokenMove={vi.fn()}
    />));

    act(() => host.querySelector<HTMLButtonElement>(".relations-view-drag-handle")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(order.move).toHaveBeenCalledWith(201, 202, "after", [201, 202]);
    expect(host.querySelectorAll("[data-spacer-slot-index]")).toHaveLength(0);

    act(() => root.unmount());
    host.remove();
  });
});

function renderTokenColumn(
  onSpacerTokenMove = vi.fn(),
  overrides: Partial<Pick<TokenLayoutProps, "workItems" | "allWorkItems">> = {}
): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const order: WorkItemOrderApi = { sortByStoredOrder: (items) => items.slice(), move: vi.fn() };
  act(() => root.render(<TokenLayoutColumn
    workItems={overrides.workItems ?? [workItem(201), workItem(202), workItem(203)]}
    allWorkItems={overrides.allWorkItems ?? [workItem(201), workItem(202), workItem(203)]}
    unfilteredCount={3}
    order={order}
    addSpacer
    spacerLayout={[201, null, 203, null, 202]}
    onSpacerTokenMove={onSpacerTokenMove}
  />));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}

function renderPersistentTokenHarness(
  options: { setId?: string; visibleWorkItems?: readonly WorkItem[] } = {}
): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<PersistentTokenHarness
    setId={options.setId ?? "active-set"}
    visibleWorkItems={options.visibleWorkItems ?? [workItem(201), workItem(202), workItem(203)]}
  />));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}

function PersistentTokenHarness(props: { setId: string; visibleWorkItems: readonly WorkItem[] }): React.ReactElement {
  const spacer = useMagicSortSpacerOption(props.setId) as unknown as TokenLayoutApi;
  return <>
    <TokenLayoutColumn
      workItems={props.visibleWorkItems}
      allWorkItems={[workItem(201), workItem(202), workItem(203)]}
      unfilteredCount={3}
      order={{ sortByStoredOrder: (items) => items.slice(), move: vi.fn() }}
      addSpacer={spacer.addSpacer}
      spacerLayout={spacer.spacerLayout}
      onSpacerTokenMove={spacer.moveVisibleWorkItemToSpacerSlot}
    />
    <output>{JSON.stringify(spacer.spacerLayout)}</output>
    <output data-add-spacer="">{String(spacer.addSpacer)}</output>
    <button type="button" data-token-layout-move="" onClick={() => spacer.moveVisibleWorkItemToSpacerSlot(202, 1)}>Move</button>
    <button type="button" data-token-layout-magic-sort="" onClick={() => spacer.applyVisiblePositions([201, 202], { 201: 0, 202: 2 })}>Magic Sort</button>
  </>;
}

function mockPreferences(layouts: Record<string, Record<string, unknown>>): void {
  let preferences = { setLayouts: layouts };
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockImplementation(() => preferences);
  vi.spyOn(preferencesClient, "isUserPreferencesCacheAuthoritative").mockReturnValue(true);
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockImplementation((patch) => {
    preferences = { ...preferences, setLayouts: { ...preferences.setLayouts, ...patch.setLayouts } };
  });
}

function renderedTokens(host: HTMLElement): SpacerToken[] {
  return [...host.querySelector<HTMLOListElement>(".relations-view-work-item-list")!.children].map((child) => {
    if (child instanceof HTMLElement && child.hasAttribute("data-spacer-slot-index")) {
      return null;
    }
    return Number((child as HTMLElement).dataset.workItemId);
  });
}

function readLayout(host: HTMLElement): readonly SpacerToken[] {
  const raw = host.querySelector("output")?.textContent;
  return raw ? JSON.parse(raw) as SpacerToken[] : [];
}

function readAddSpacer(host: HTMLElement): boolean {
  return host.querySelector("[data-add-spacer]")?.textContent === "true";
}

function renderedSpacerSlots(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]")];
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

function fireDrag(target: HTMLElement, type: string, init: { dataTransfer: DataTransfer }): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: init.dataTransfer });
  target.dispatchEvent(event);
}

function workItem(id: number): WorkItem {
  return { id, workItemType: "Bug", title: `Bug ${id}`, state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] };
}
