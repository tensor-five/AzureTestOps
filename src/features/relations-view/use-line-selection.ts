import * as React from "react";

export type LineSelectionApi = {
  selectedLineId: string | null;
  selectLine(lineId: string | null): void;
  clearSelection(): void;
};

export type UseLineSelectionDeps = {
  /**
   * Invoked when the user presses Delete/Backspace while a line is selected.
   * Receives the currently selected line id; the consumer is responsible for
   * resolving it back to the underlying relation pair and calling the relation
   * mutation hook.
   */
  onDeleteRequested(lineId: string): void;
  /**
   * When false the global key listener is removed — used to stop swallowing
   * Delete keystrokes while move-mode is active or no set is loaded.
   */
  enabled: boolean;
};

const DELETE_KEYS = new Set(["Delete", "Backspace"]);

/**
 * Single-selection state for relation lines plus a window-level Delete /
 * Backspace listener.
 *
 * The listener is gated on `enabled` so move-mode does not steal keystrokes
 * meant for form inputs in dialogs. We also bail out if the active element is
 * an `input` / `textarea` / `[contenteditable]` so the dialog forms keep
 * working — pressing Backspace inside a name field must not delete a line in
 * the background.
 */
export function useLineSelection(deps: UseLineSelectionDeps): LineSelectionApi {
  const [selectedLineId, setSelectedLineId] = React.useState<string | null>(null);

  const onDeleteRequestedRef = React.useRef(deps.onDeleteRequested);
  onDeleteRequestedRef.current = deps.onDeleteRequested;

  const selectedLineIdRef = React.useRef(selectedLineId);
  selectedLineIdRef.current = selectedLineId;

  React.useEffect(() => {
    if (!deps.enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        setSelectedLineId(null);
        return;
      }
      if (!DELETE_KEYS.has(event.key)) {
        return;
      }
      if (isEditingTextNode(event.target)) {
        return;
      }
      const id = selectedLineIdRef.current;
      if (!id) {
        return;
      }
      event.preventDefault();
      onDeleteRequestedRef.current(id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deps.enabled]);

  const selectLine = React.useCallback((lineId: string | null) => {
    setSelectedLineId(lineId);
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedLineId(null);
  }, []);

  return { selectedLineId, selectLine, clearSelection };
}

function isEditingTextNode(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return false;
}
