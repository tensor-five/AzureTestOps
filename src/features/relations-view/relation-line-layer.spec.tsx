// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelationLineLayer, type LineSpec } from "./relation-line-layer.js";

const LINE: LineSpec = {
  lineId: "tc:1:10->wi:2",
  testCaseItemKey: "tc:1:10",
  workItemItemKey: "wi:2",
  testCaseWorkItemId: 1,
  workItemWorkItemId: 2,
  pending: false
};

describe("RelationLineLayer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports only lines with measurable endpoints after collapse or mobile hiding", () => {
    const geometry = createGeometry();
    const onVisibleLineIdsChange = vi.fn();
    const harness = renderLayer(geometry.container, onVisibleLineIdsChange);

    expect(onVisibleLineIdsChange).toHaveBeenLastCalledWith(new Set([LINE.lineId]));
    expect(harness.host.querySelector(`[data-line-id="${LINE.lineId}"]`)).not.toBeNull();

    geometry.source.remove();
    harness.rerender(1);
    expect(onVisibleLineIdsChange).toHaveBeenLastCalledWith(new Set());
    expect(harness.host.querySelector(`[data-line-id="${LINE.lineId}"]`)).toBeNull();

    geometry.container.appendChild(geometry.source);
    geometry.targetVisible = false;
    harness.rerender(2);
    expect(onVisibleLineIdsChange).toHaveBeenLastCalledWith(new Set());

    harness.unmount();
    geometry.container.remove();
  });

  it("recomputes coordinates when the layout revision changes", () => {
    const geometry = createGeometry();
    const harness = renderLayer(geometry.container, vi.fn());
    const firstStroke = harness.host.querySelector<SVGLineElement>(
      ".relations-view-line-stroke"
    )!;
    expect(firstStroke.getAttribute("y1")).toBe("20");

    geometry.sourceTop = 80;
    harness.rerender("work-item-order:1");

    const movedStroke = harness.host.querySelector<SVGLineElement>(
      ".relations-view-line-stroke"
    )!;
    expect(movedStroke.getAttribute("y1")).toBe("90");

    harness.unmount();
    geometry.container.remove();
  });

  it("recomputes after structural column changes without an explicit layout revision", async () => {
    const geometry = createGeometry();
    const harness = renderLayer(geometry.container, vi.fn());
    expect(harness.host.querySelector(".relations-view-line-stroke")?.getAttribute("y1"))
      .toBe("20");

    geometry.sourceTop = 120;
    geometry.container.appendChild(document.createElement("div"));

    await vi.waitFor(() => {
      expect(harness.host.querySelector(".relations-view-line-stroke")?.getAttribute("y1"))
        .toBe("130");
    });

    harness.unmount();
    geometry.container.remove();
  });
});

function renderLayer(
  container: HTMLElement,
  onVisibleLineIdsChange: (lineIds: ReadonlySet<string>) => void
): {
  host: HTMLDivElement;
  rerender(layoutVersion: number | string): void;
  unmount(): void;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (layoutVersion: number | string): void => {
    act(() => root.render(
      <RelationLineLayer
        container={container}
        lines={[LINE]}
        draft={null}
        selectedLineId={null}
        onSelectLine={() => undefined}
        onVisibleLineIdsChange={onVisibleLineIdsChange}
        layoutVersion={layoutVersion}
      />
    ));
  };
  render(0);
  return {
    host,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    }
  };
}

function createGeometry(): {
  container: HTMLDivElement;
  source: HTMLDivElement;
  target: HTMLDivElement;
  sourceTop: number;
  targetVisible: boolean;
} {
  const geometry = {
    container: document.createElement("div"),
    source: document.createElement("div"),
    target: document.createElement("div"),
    sourceTop: 10,
    targetVisible: true
  };
  geometry.source.dataset.itemKey = LINE.testCaseItemKey;
  geometry.source.dataset.relationsAnchor = "left";
  geometry.target.dataset.itemKey = LINE.workItemItemKey;
  geometry.target.dataset.relationsAnchor = "right";
  geometry.container.append(geometry.source, geometry.target);
  document.body.appendChild(geometry.container);

  geometry.container.getBoundingClientRect = () => rect(0, 0, 600, 400);
  geometry.source.getBoundingClientRect = () => rect(20, geometry.sourceTop, 180, 20);
  geometry.target.getBoundingClientRect = () => geometry.targetVisible
    ? rect(400, 60, 180, 20)
    : rect(0, 0, 0, 0);
  return geometry;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ""
  } as DOMRect;
}
