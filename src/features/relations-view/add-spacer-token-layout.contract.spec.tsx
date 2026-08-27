// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
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
};

const TokenLayoutColumn = WorkItemColumn as unknown as React.ComponentType<TokenLayoutProps>;

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
    const onSpacerTokenMove = vi.fn();
    const harness = renderTokenColumn(onSpacerTokenMove);
    const handles = harness.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    const slots = harness.host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]");
    const targetSlot = slots[1]!;
    const transfer = buildDataTransferStub();

    expect(slots).toHaveLength(2);
    act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(targetSlot, "dragover", { dataTransfer: transfer }));
    expect(targetSlot.getAttribute("data-drop-preview")).toBe("true");
    expect(targetSlot.getAttribute("draggable")).not.toBe("true");
    expect(targetSlot.querySelector(".relations-view-drag-handle")).toBeNull();

    act(() => fireDrag(targetSlot, "drop", { dataTransfer: transfer }));
    expect(onSpacerTokenMove).toHaveBeenCalledWith(203, 3);

    harness.unmount();
  });

  it("ASTL-05 persists the token stack per Set and migrates legacy Spacer positions without losing slots", () => {
    let preferences = {
      setLayouts: {
        "active-set": {
          magicSortAddSpacer: true,
          workItemSpacerPositions: { "201": 0, "202": 4, "203": 2 }
        }
      }
    };
    vi.spyOn(preferencesClient, "getCachedUserPreferences").mockImplementation(() => preferences);
    vi.spyOn(preferencesClient, "isUserPreferencesCacheAuthoritative").mockReturnValue(true);
    vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockImplementation((patch) => {
      preferences = { ...preferences, setLayouts: { ...preferences.setLayouts, ...patch.setLayouts } };
    });

    const first = renderPersistentHarness();
    expect(readLayout(first.host)).toEqual([201, null, 203, null, 202]);
    act(() => first.host.querySelector<HTMLButtonElement>("button")?.click());
    expect(readLayout(first.host)).toEqual([201, 202, 203, null, null]);
    first.unmount();

    clearSetLayoutPreferenceForTests();
    const restored = renderPersistentHarness();
    expect(readLayout(restored.host)).toEqual([201, 202, 203, null, null]);
    restored.unmount();
  });

  it("ASTL-06 changes only visible Bugs and slots while filtered-out Bug tokens stay intact", () => {
    const onSpacerTokenMove = vi.fn();
    const harness = renderTokenColumn(onSpacerTokenMove, {
      workItems: [workItem(201), workItem(202)],
      allWorkItems: [workItem(201), workItem(202), workItem(203)]
    });
    const slots = harness.host.querySelectorAll<HTMLElement>("[data-spacer-slot-index]");
    const handles = harness.host.querySelectorAll<HTMLButtonElement>(".relations-view-drag-handle");
    const transfer = buildDataTransferStub();

    expect(renderedTokens(harness.host)).toEqual([201, null, null, 202]);
    expect(harness.host.querySelector('[data-work-item-id="203"]')).toBeNull();
    act(() => fireDrag(handles[1]!, "dragstart", { dataTransfer: transfer }));
    act(() => fireDrag(slots[0]!, "drop", { dataTransfer: transfer }));
    expect(onSpacerTokenMove).toHaveBeenCalledWith(202, 1);

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

function renderPersistentHarness(): { host: HTMLDivElement; unmount(): void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<PersistentHarness />));
  return { host, unmount() { act(() => root.unmount()); host.remove(); } };
}

function PersistentHarness(): React.ReactElement {
  const spacer = useMagicSortSpacerOption("active-set") as unknown as TokenLayoutApi;
  return <>
    <output>{JSON.stringify(spacer.spacerLayout)}</output>
    <button type="button" onClick={() => spacer.moveVisibleWorkItemToSpacerSlot(202, 1)}>Move</button>
  </>;
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
