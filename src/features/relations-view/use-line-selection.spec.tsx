// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useLineSelection, type LineSelectionApi } from "./use-line-selection.js";

type Harness = {
  result: { current: LineSelectionApi };
  rerender(props: { enabled: boolean }): void;
  unmount(): void;
};

function renderHook(
  initial: { enabled: boolean },
  onDeleteRequested: (lineId: string) => void
): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: undefined as unknown as LineSelectionApi };
  let currentProps = initial;

  function Capture(): React.ReactElement {
    result.current = useLineSelection({
      enabled: currentProps.enabled,
      onDeleteRequested
    });
    return <div />;
  }

  act(() => {
    root.render(<Capture />);
  });

  return {
    result,
    rerender(next) {
      currentProps = next;
      act(() => {
        root.render(<Capture />);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("useLineSelection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no selection", () => {
    const harness = renderHook({ enabled: true }, () => undefined);
    expect(harness.result.current.selectedLineId).toBeNull();
    harness.unmount();
  });

  it("selectLine and clearSelection update the state", () => {
    const harness = renderHook({ enabled: true }, () => undefined);
    act(() => {
      harness.result.current.selectLine("line-a");
    });
    expect(harness.result.current.selectedLineId).toBe("line-a");
    act(() => {
      harness.result.current.clearSelection();
    });
    expect(harness.result.current.selectedLineId).toBeNull();
    harness.unmount();
  });

  it("invokes onDeleteRequested with the selected id when Delete is pressed", () => {
    const onDelete = vi.fn();
    const harness = renderHook({ enabled: true }, onDelete);

    act(() => {
      harness.result.current.selectLine("line-a");
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });

    expect(onDelete).toHaveBeenCalledWith("line-a");
    harness.unmount();
  });

  it("treats Backspace the same as Delete", () => {
    const onDelete = vi.fn();
    const harness = renderHook({ enabled: true }, onDelete);

    act(() => {
      harness.result.current.selectLine("line-b");
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(onDelete).toHaveBeenCalledWith("line-b");
    harness.unmount();
  });

  it("clears selection on Escape", () => {
    const harness = renderHook({ enabled: true }, () => undefined);

    act(() => {
      harness.result.current.selectLine("line-a");
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(harness.result.current.selectedLineId).toBeNull();
    harness.unmount();
  });

  it("ignores Delete when no line is selected", () => {
    const onDelete = vi.fn();
    const harness = renderHook({ enabled: true }, onDelete);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("ignores Delete when typed inside an input element", () => {
    const onDelete = vi.fn();
    const harness = renderHook({ enabled: true }, onDelete);

    act(() => {
      harness.result.current.selectLine("line-a");
    });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    input.remove();
    harness.unmount();
  });

  it("removes the listener when disabled", () => {
    const onDelete = vi.fn();
    const harness = renderHook({ enabled: true }, onDelete);

    act(() => {
      harness.result.current.selectLine("line-a");
    });

    harness.rerender({ enabled: false });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    harness.unmount();
  });
});
