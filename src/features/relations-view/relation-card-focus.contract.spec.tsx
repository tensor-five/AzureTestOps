// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { userEvent } from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import { WithClientPorts, buildClientPortsStub } from "../../app/composition/test-client-ports.js";
import * as preferencesClient from "../../shared/user-preferences/user-preferences.client.js";
import { clearSetFilterPreferenceForTests } from "../filters/set-filter-preference-store.js";
import { clearSetLayoutPreferenceForTests } from "./set-layout-preference-store.js";
import { RelationsPane } from "./relations-pane.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refreshControl = <button type="button">Refresh</button>;

function snapshot(): ActiveSetSnapshot {
  return {
    set: { id: "set-focus", name: "Focus", planId: "9", rootSuiteId: "1", queryId: "Q-focus" },
    suiteTree: { id: 1, name: "Payments", parentSuiteId: null, path: "Payments", children: [] },
    projections: [
      projection(101, "Approved payment"),
      projection(102, "Declined payment"),
      projection(103, "Unsupported payment method")
    ],
    workItemsFromQuery: [
      workItem(501, "Card validation message", [101, 102]),
      workItem(502, "Retry state is stale", [102]),
      workItem(503, "Unsupported payment method is not displayed", [101])
    ],
    loadedAt: "2026-08-26T10:00:00.000Z"
  };
}

function projection(workItemId: number, title: string) {
  return {
    workItemId,
    suiteId: 1,
    suitePath: "Payments",
    title,
    state: "Design",
    workItemType: "Test Case",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    testPointId: null,
    configurationId: null,
    configurationName: null,
    lastOutcome: "Passed",
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

function workItem(id: number, title: string, relatedIds: number[]) {
  return {
    id,
    workItemType: "Bug",
    title,
    state: "Active",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds
  };
}

function renderPane(): { container: HTMLDivElement; relationAdd: ReturnType<typeof vi.fn>; unmount(): void } {
  clearSetLayoutPreferenceForTests();
  clearSetFilterPreferenceForTests();
  vi.spyOn(preferencesClient, "getCachedUserPreferences").mockReturnValue({});
  vi.spyOn(preferencesClient, "persistUserPreferencesPatch").mockReturnValue();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const relationAdd = vi.fn(async () => undefined);
  const ports = buildClientPortsStub({
    adoContext: {
      getContext: async () => null,
      setContext: async (context) => context,
      getCliDefaults: async () => ({ organization: "", project: "" })
    },
    relationMutations: { add: relationAdd, remove: async () => undefined }
  });
  act(() => {
    root.render(
      <WithClientPorts ports={ports}>
        <RelationsPane
          setId="set-focus"
          snapshot={snapshot()}
          isLoading={false}
          error={null}
          hasActiveSet
          refreshControl={refreshControl}
        />
      </WithClientPorts>
    );
  });
  return {
    container,
    relationAdd,
    unmount() {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
    }
  };
}

function card(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  return element!;
}

function focusControl(cardElement: HTMLElement): HTMLElement {
  const controls = cardElement.querySelectorAll<HTMLElement>(
    'button, [role="button"]:not(.relations-view-card-line-anchor)'
  );
  expect(controls).toHaveLength(1);
  const control = controls[0] ?? null;
  expect(control).not.toBeNull();
  return control!;
}

function accessibleLabel(control: HTMLElement): string {
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (label) return label;
  }
  return (control.getAttribute("aria-label") ?? control.textContent ?? "").trim();
}

describe("Relation card focus contract v1", () => {
  it("RCF-01 places a focus control immediately left of the Related-link handle in every Test Case card", () => {
    const harness = renderPane();
    const testCases = harness.container.querySelectorAll<HTMLElement>(".relations-view-card-test-case");
    expect(testCases).toHaveLength(3);
    testCases.forEach((testCase) => {
      const control = focusControl(testCase);
      const handle = testCase.querySelector(".relations-view-card-line-anchor-right");
      expect(control.nextElementSibling).toBe(handle);
    });
    harness.unmount();
  });

  it("RCF-02 places a focus control immediately right of the Related-link handle in every Bug card", () => {
    const harness = renderPane();
    const bugs = harness.container.querySelectorAll<HTMLElement>(".relations-view-card-work-item");
    expect(bugs).toHaveLength(3);
    bugs.forEach((bug) => {
      const control = focusControl(bug);
      const handle = bug.querySelector(".relations-view-card-line-anchor-left");
      expect(handle?.nextElementSibling).toBe(control);
    });
    harness.unmount();
  });

  it("RCF-03 gives every focus control a distinct accessible label and supports keyboard activation", async () => {
    const harness = renderPane();
    const controls = [...harness.container.querySelectorAll<HTMLElement>(".relations-view-card")]
      .map(focusControl);
    const labels = controls.map(accessibleLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    const control = focusControl(card(harness.container, '[data-test-case-id="101"] .relations-view-card-test-case'));
    const bugControl = focusControl(card(harness.container, '[data-work-item-id="501"] .relations-view-card-work-item'));
    const user = userEvent.setup();

    control.focus();
    await user.keyboard("{Enter}");
    expect(card(harness.container, '[data-test-case-id="101"]')
      .classList.contains("relations-view-item-focus-match")).toBe(true);
    await user.click(control);
    bugControl.focus();
    await user.keyboard("{Enter}");
    expect(card(harness.container, '[data-work-item-id="501"]')
      .classList.contains("relations-view-item-focus-match")).toBe(true);
    harness.unmount();
  });

  it("RCF-04 highlights the selected Test Case, its directly related Bug and their line while dimming unrelated cards and lines", async () => {
    const harness = renderPane();
    const selectedTestCase = card(harness.container, '[data-test-case-id="101"]');
    const relatedBugOne = card(harness.container, '[data-work-item-id="501"]');
    const relatedBugTwo = card(harness.container, '[data-work-item-id="503"]');
    const unrelatedTestCaseOne = card(harness.container, '[data-test-case-id="102"]');
    const unrelatedTestCaseTwo = card(harness.container, '[data-test-case-id="103"]');
    const unrelatedBug = card(harness.container, '[data-work-item-id="502"]');
    const control = focusControl(card(selectedTestCase, ".relations-view-card-test-case"));

    await userEvent.setup().click(control);
    expect(selectedTestCase.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(relatedBugOne.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(relatedBugTwo.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(unrelatedTestCaseOne.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(unrelatedTestCaseTwo.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(unrelatedBug.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="101::501"]')?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="101::503"]')?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="102::501"]')?.classList.contains("relations-view-line-focus-dimmed")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="102::502"]')?.classList.contains("relations-view-line-focus-dimmed")).toBe(true);
    harness.unmount();
  });

  it("RCF-04 highlights the selected Bug and all directly related Test Cases", async () => {
    const harness = renderPane();
    const selectedBug = card(harness.container, '[data-work-item-id="501"]');
    const relatedTestCaseOne = card(harness.container, '[data-test-case-id="101"]');
    const relatedTestCaseTwo = card(harness.container, '[data-test-case-id="102"]');
    const unrelatedTestCase = card(harness.container, '[data-test-case-id="103"]');
    const unrelatedBug = card(harness.container, '[data-work-item-id="502"]');
    const secondUnrelatedBug = card(harness.container, '[data-work-item-id="503"]');

    await userEvent.setup().click(focusControl(card(selectedBug, ".relations-view-card-work-item")));
    expect(selectedBug.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(relatedTestCaseOne.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(relatedTestCaseTwo.classList.contains("relations-view-item-focus-match")).toBe(true);
    expect(unrelatedTestCase.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(unrelatedBug.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(secondUnrelatedBug.classList.contains("relations-view-item-focus-dimmed")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="101::501"]')?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="102::501"]')?.classList.contains("relations-view-line-focus-match")).toBe(true);
    expect(harness.container.querySelector('[data-line-id="102::502"]')?.classList.contains("relations-view-line-focus-dimmed")).toBe(true);
    harness.unmount();
  });

  it("RCF-05 clears the card focus when its pressed control is activated again", async () => {
    const harness = renderPane();
    const selectedTestCase = card(harness.container, '[data-test-case-id="101"]');
    const control = focusControl(card(selectedTestCase, ".relations-view-card-test-case"));
    const user = userEvent.setup();

    await user.click(control);
    await user.click(control);
    expect(harness.container.querySelector(".relations-view-item-focus-match")).toBeNull();
    expect(harness.container.querySelector(".relations-view-item-focus-dimmed")).toBeNull();
    expect(harness.container.querySelector(".relations-view-line-focus-match")).toBeNull();
    expect(harness.container.querySelector(".relations-view-line-focus-dimmed")).toBeNull();
    const bugControl = focusControl(card(harness.container, '[data-work-item-id="501"] .relations-view-card-work-item'));
    await user.click(bugControl);
    await user.click(bugControl);
    expect(harness.container.querySelector(".relations-view-item-focus-match")).toBeNull();
    expect(harness.container.querySelector(".relations-view-item-focus-dimmed")).toBeNull();
    expect(harness.container.querySelector(".relations-view-line-focus-match")).toBeNull();
    expect(harness.container.querySelector(".relations-view-line-focus-dimmed")).toBeNull();
    harness.unmount();
  });

  it("RCF-06 retains working suite focus, Related-link handles and separate reorder handles", async () => {
    const harness = renderPane();
    const suiteFocus = harness.container.querySelector<HTMLButtonElement>('button[aria-label="Focus suite Payments"]');
    const testCase = card(harness.container, '[data-test-case-id="103"] .relations-view-card-test-case');
    const bug = card(harness.container, '[data-work-item-id="502"] .relations-view-card-work-item');

    expect(suiteFocus).not.toBeNull();
    expect(testCase.querySelector(".relations-view-card-line-anchor-right")).not.toBeNull();
    expect(bug.querySelector(".relations-view-card-line-anchor-left")).not.toBeNull();
    expect(harness.container.querySelectorAll(".relations-view-drag-handle")).toHaveLength(6);
    act(() => suiteFocus?.click());
    expect(harness.container.querySelector(".relations-workspace-focus-chip")?.textContent).toContain("Payments");
    act(() => testCase.querySelector<HTMLElement>(".relations-view-card-line-anchor-right")?.dispatchEvent(
      makePointerEvent("pointerdown", { clientX: 20, clientY: 20 })
    ));
    expect(harness.container.querySelector(".relations-view-line-draft")).not.toBeNull();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => card(harness.container, '[data-work-item-id="503"] .relations-view-card-work-item')
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientX: 40, clientY: 20 }));
      await Promise.resolve();
    });
    expect(harness.relationAdd).toHaveBeenCalledWith({ sourceId: 103, targetId: 503 });
    const bugHandle = bug.querySelector<HTMLElement>(".relations-view-card-line-anchor-left");
    act(() => bugHandle?.dispatchEvent(makePointerEvent("pointerdown", { clientX: 40, clientY: 20 })));
    expect(harness.container.querySelector(".relations-view-line-draft")).not.toBeNull();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => card(harness.container, '[data-test-case-id="101"] .relations-view-card-test-case')
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientX: 20, clientY: 20 }));
      await Promise.resolve();
    });
    expect(harness.relationAdd).toHaveBeenCalledTimes(2);
    expect(harness.relationAdd).toHaveBeenLastCalledWith({ sourceId: 101, targetId: 502 });
    const testCaseHandles = harness.container.querySelectorAll<HTMLButtonElement>(
      ".relations-view-test-case-row .relations-view-drag-handle"
    );
    testCaseHandles[0]?.focus();
    const reorderUser = userEvent.setup();
    await act(async () => { await reorderUser.keyboard("{ArrowDown}"); });
    expect([...harness.container.querySelectorAll<HTMLElement>(".relations-view-test-case-row")]
      .map((row) => row.dataset.testCaseId)).toEqual(["102", "101", "103"]);
    const bugHandles = harness.container.querySelectorAll<HTMLButtonElement>(
      ".relations-view-work-item-list-item .relations-view-drag-handle"
    );
    bugHandles[0]?.focus();
    await act(async () => { await reorderUser.keyboard("{ArrowDown}"); });
    expect([...harness.container.querySelectorAll<HTMLElement>(".relations-view-work-item-list-item")]
      .map((row) => row.dataset.workItemId)).toEqual(["502", "501", "503"]);
    harness.unmount();
  });
});

function makePointerEvent(
  type: string,
  init: { clientX: number; clientY: number; pointerId?: number }
): PointerEvent {
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: init.pointerId ?? 1,
      clientX: init.clientX,
      clientY: init.clientY,
      button: 0
    });
  }
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: 0
  }) as MouseEvent & { pointerId: number };
  event.pointerId = init.pointerId ?? 1;
  return event as unknown as PointerEvent;
}
