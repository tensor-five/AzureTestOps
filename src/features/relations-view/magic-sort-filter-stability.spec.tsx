// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planMagicSort, type MagicSortInput } from "./magic-sort-layout.js";
import { captureMagicSortGeometry } from "./magic-sort-geometry.js";
import { magicSortEdges, measureMagicSort } from "./magic-sort-metrics.js";
import { useMagicSort } from "./use-magic-sort.js";
import { useMagicSortSpacerOption } from "./use-magic-sort-spacer-option.js";
import { projectVisibleSpacerLayout } from "./work-item-spacer-layout.js";
import { WorkItemColumn } from "./work-item-column.js";
import { clearSetLayoutPreferenceForTests, setLayoutPreferenceStore } from "./set-layout-preference-store.js";

afterEach(() => { cleanup(); clearSetLayoutPreferenceForTests(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function pairs(count: number): MagicSortInput {
  return {
    suites: Array.from({ length: count }, (_, i) => ({ suiteId: i + 1, testCaseIds: [101 + i] })),
    workItemIds: Array.from({ length: count }, (_, i) => 201 + i),
    workItems: Array.from({ length: count }, (_, i) => ({ id: 201 + i, relatedTestCaseIds: [101 + i] })),
    addSpacer: true
  };
}
function bug(id: number) {
  return { id, title: `Dataload ${id}`, workItemType: "Bug", state: "Active", assignedTo: null, tags: [], areaPath: null, priority: null, relatedIds: [] };
}
function rect(element: Element, top: number, height: number) {
  Object.defineProperty(element, "getBoundingClientRect", { value: () => ({ top, height }), configurable: true });
}

describe("Magic Sort filtered layouts", () => {
  it("renders and restores exactly the planned visible slots while retaining hidden Bugs", () => {
    setLayoutPreferenceStore.save({ magicSortAddSpacer: true, workItemSpacerLayout: [901, 201, null, 202] }, { scopeKey: "filter" });
    const hook = renderHook(() => useMagicSortSpacerOption("filter"));
    act(() => hook.result.current.applyVisiblePositions([201, 202], { 201: 1, 202: 3 }));
    const positions = () => Object.fromEntries(projectVisibleSpacerLayout(hook.result.current.spacerLayout, new Set([201, 202]))
      .flatMap((row, index) => row.workItemId === null ? [] : [[row.workItemId, index]]));
    expect(positions()).toEqual({ 201: 1, 202: 3 });
    expect(hook.result.current.spacerLayout).toContain(901);
    hook.unmount();
    const restored = renderHook(() => useMagicSortSpacerOption("filter"));
    expect(projectVisibleSpacerLayout(restored.result.current.spacerLayout, new Set([201, 202])).map(row => row.workItemId))
      .toEqual([null, 201, null, 202]);
  });

  it("shows newly unfiltered Bugs even if they have no stored spacer token", () => {
    const view = render(<WorkItemColumn workItems={[bug(201)]} unfilteredCount={2} addSpacer spacerLayout={[201]} onSpacerTokenMove={() => undefined} />);
    view.rerender(<WorkItemColumn workItems={[bug(201), bug(202)]} unfilteredCount={2} addSpacer spacerLayout={[201]} onSpacerTokenMove={() => undefined} />);
    expect([...view.container.querySelectorAll("[data-work-item-id]")].map(node => node.getAttribute("data-work-item-id"))).toEqual(["201", "202"]);
  });

  it("creates real-height candidate spacers for a single text-filtered Bug", () => {
    const container = document.createElement("section");
    container.innerHTML = '<div class="relations-view-suite-header"><button data-suite-id="1"></button></div><div data-test-case-id="101"></div><ol class="relations-view-work-item-list" style="row-gap:2px"><li data-work-item-id="201"></li></ol>';
    document.body.append(container);
    rect(container, 0, 400);
    rect(container.querySelector(".relations-view-suite-header")!, 20, 20);
    rect(container.querySelector("[data-test-case-id]")!, 214, 36);
    rect(container.querySelector("li")!, 100, 36);
    const input = { ...pairs(1), visibleRows: [{ kind: "suite-header" as const, suiteId: 1 }, { kind: "test-case" as const, suiteId: 1, testCaseId: 101 }] };
    const geometry = captureMagicSortGeometry({ container, visibleRows: input.visibleRows, workItemIds: [201] });
    expect(geometry.measuredWorkItemSlotCenters?.slice(0, 4)).toEqual([118, 156, 194, 232]);
    expect(planMagicSort({ ...input, ...geometry }).steps.at(-1)?.workItemPositions?.[201]).toBe(3);
    container.remove();
  });

  it("measures separate occurrences of the same Test Case in different suites", () => {
    const container = document.createElement("section");
    container.innerHTML = '<div data-suite-cards data-suite-id="1"><div data-test-case-id="101"></div></div><div data-suite-cards data-suite-id="2"><div data-test-case-id="101"></div></div><ol class="relations-view-work-item-list"><li></li><li></li></ol>';
    rect(container, 0, 500);
    container.querySelectorAll("[data-test-case-id]").forEach((node, i) => rect(node, 60 + i * 300, 36));
    container.querySelectorAll("li").forEach((node, i) => rect(node, 60 + i * 38, 36));
    const geometry = captureMagicSortGeometry({ container, visibleRows: [{ kind: "test-case", suiteId: 1, testCaseId: 101 }, { kind: "test-case", suiteId: 2, testCaseId: 101 }], workItemIds: [201, 202] });
    expect(geometry.measuredTestCaseSlotCenters).toEqual([78, 378]);
  });

  it("never worsens fifty already horizontal relations when an unlinked Bug is also visible", () => {
    const input = pairs(50);
    input.workItemIds = [...input.workItemIds, 999];
    input.workItems = [...input.workItems, { id: 999, relatedTestCaseIds: [] }];
    input.workItemPositions = Object.fromEntries(input.workItemIds.map((id, index) => [id, index]));
    const final = planMagicSort(input).steps.at(-1)!;
    expect(Array.from({ length: 50 }, (_, index) => final.workItemPositions?.[index + 201])).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  it("aligns an entire group beyond the former 48-step limit and remains stable on another click", () => {
    const input = { ...pairs(55), measuredTestCaseSlotCenters: Array.from({ length: 55 }, (_, i) => 100 + i * 10), measuredWorkItemSlotCenters: Array.from({ length: 65 }, (_, i) => i * 10) };
    const final = planMagicSort(input).steps.at(-1)!;
    expect(input.workItemIds.map(id => final.workItemPositions?.[id])).toEqual(Array.from({ length: 55 }, (_, i) => 10 + i));
    expect(planMagicSort({ ...input, ...final }).steps.at(-1)).toEqual(final);
  });

  it("applies the final layout before a later visible input change and queues no more layout writes", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const first: MagicSortInput = { ...pairs(3), addSpacer: false, workItemIds: [203, 202, 201] };
    const apply = vi.fn();
    const hook = renderHook(({ input }) => useMagicSort({ input, applyLayout: apply }), { initialProps: { input: first } });
    act(() => hook.result.current.start());
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.lastCall?.[0].workItemIds).toEqual([201, 202, 203]);
    expect(hook.result.current.isRunning).toBe(false);
    apply.mockClear();
    hook.rerender({ input: { ...pairs(1), addSpacer: false } });
    act(() => vi.runAllTimers());
    expect(apply).not.toHaveBeenCalled();
  });

  it("measures the final layout including each Test Case occurrence", () => {
    const input: MagicSortInput = { ...pairs(2), suites: [{ suiteId: 1, testCaseIds: [102, 101] }], visibleRows: [{ kind: "test-case", suiteId: 1, testCaseId: 102 }, { kind: "test-case", suiteId: 1, testCaseId: 101 }] };
    const geometry = { measuredTestCaseSlotCenters: [100, 200], measuredWorkItemSlotCenters: [100, 200] };
    const plan = { steps: [{ suites: [{ suiteId: 1, testCaseIds: [101, 102] }], workItemIds: [201, 202] }] };
    expect(measureMagicSort(plan.steps[0]!, { ...input, ...geometry })).toMatchObject({ crossings: 0, length: 0 });
    const duplicateInput: MagicSortInput = { ...pairs(1), suites: [{ suiteId: 1, testCaseIds: [101] }, { suiteId: 2, testCaseIds: [101] }] };
    const duplicateGeometry = { measuredTestCaseSlotCenters: [100, 300], measuredWorkItemSlotCenters: [200] };
    const measuredDuplicateInput = { ...duplicateInput, ...duplicateGeometry };
    expect(magicSortEdges(duplicateInput, measuredDuplicateInput)).toHaveLength(2);
    expect(measureMagicSort(duplicateInput, measuredDuplicateInput).length).toBe(200);
  });

  it("applies its own final layout immediately and a later set switch queues nothing", () => {
    vi.useFakeTimers();
    const input = { ...pairs(3), addSpacer: false, workItemIds: [203, 202, 201] };
    const hook = renderHook(({ setId }) => {
      const [current, setCurrent] = React.useState<MagicSortInput>(input);
      return useMagicSort({ input: current, contextKey: setId, applyLayout: layout => setCurrent(previous => ({ ...previous, ...layout })) });
    }, { initialProps: { setId: "first" } });
    act(() => hook.result.current.start());
    expect(hook.result.current.isRunning).toBe(false);
    expect(hook.result.current.feedbackState).toBe("confirmed");
    act(() => vi.runAllTimers());
    expect(hook.result.current.feedbackState).toBe("idle");
    hook.unmount();
    const apply = vi.fn();
    const switching = renderHook(({ setId }) => useMagicSort({ input, contextKey: setId, applyLayout: apply }), { initialProps: { setId: "first" } });
    act(() => switching.result.current.start());
    expect(apply).toHaveBeenCalledOnce();
    apply.mockClear();
    switching.rerender({ setId: "second" });
    act(() => vi.runAllTimers());
    expect(apply).not.toHaveBeenCalled();
  });

  it("queues no sort write that could overwrite a later manual reorder", () => {
    vi.useFakeTimers();
    const first: MagicSortInput = { ...pairs(3), addSpacer: false, workItemIds: [203, 202, 201] };
    const apply = vi.fn();
    const hook = renderHook(({ input }) => useMagicSort({ input, applyLayout: apply }), { initialProps: { input: first } });
    act(() => hook.result.current.start());
    expect(apply).toHaveBeenCalledOnce();
    apply.mockClear();
    hook.rerender({ input: { ...first, workItemIds: [202, 201, 203] } });
    act(() => vi.runAllTimers());
    expect(apply).not.toHaveBeenCalled();
  });

  it("can start normally after resizing an idle view", () => {
    vi.useFakeTimers();
    const input: MagicSortInput = { ...pairs(3), addSpacer: false, workItemIds: [203, 202, 201] };
    const apply = vi.fn();
    const hook = renderHook(() => useMagicSort({ input, applyLayout: apply }));
    act(() => globalThis.dispatchEvent(new Event("resize")));
    act(() => hook.result.current.start());
    act(() => vi.runAllTimers());
    expect(apply).toHaveBeenCalled();
    expect(apply.mock.lastCall?.[0].workItemIds).toEqual([201, 202, 203]);
    expect(hook.result.current.isRunning).toBe(false);
  });
});
