import * as React from "react";

import type { ItemOrderEdge } from "./item-order.js";

const DROP_EDGE_ATTRIBUTE = "data-drop-edge";

export type ItemDropTarget<T> = {
  item: T;
  edge: ItemOrderEdge;
};

type ElementDropTarget<T> = ItemDropTarget<T> & {
  element: HTMLElement;
};

export function useItemDragging<T>(options: {
  containerRef: React.RefObject<HTMLElement | null>;
  rowSelector: string;
  readItem: (row: HTMLElement) => T | null;
}): {
  previewAt(clientY: number): ItemDropTarget<T> | null;
  getPreviewTarget(): ItemDropTarget<T> | null;
  clearPreview(): void;
  handleDragLeave(event: React.DragEvent<HTMLElement>): void;
} {
  const previewRef = React.useRef<ElementDropTarget<T> | null>(null);

  const clearPreview = React.useCallback(() => {
    previewRef.current?.element.removeAttribute(DROP_EDGE_ATTRIBUTE);
    options.containerRef.current
      ?.querySelectorAll(`[${DROP_EDGE_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(DROP_EDGE_ATTRIBUTE));
    previewRef.current = null;
  }, [options.containerRef]);

  const validatePreview = React.useCallback((): ElementDropTarget<T> | null => {
    const preview = previewRef.current;
    if (!preview) {
      return null;
    }

    const container = options.containerRef.current;
    const isCurrentRow = container
      ? Array.from(container.querySelectorAll<HTMLElement>(options.rowSelector)).includes(
          preview.element
        )
      : false;
    const currentItem = isCurrentRow ? options.readItem(preview.element) : null;
    if (!isCurrentRow || !Object.is(currentItem, preview.item)) {
      clearPreview();
      return null;
    }

    return preview;
  }, [clearPreview, options.containerRef, options.readItem, options.rowSelector]);

  const previewAt = React.useCallback(
    (clientY: number): ItemDropTarget<T> | null => {
      const container = options.containerRef.current;
      if (!container) {
        return toPublicTarget(validatePreview());
      }

      const target = resolveVerticalTarget(
        container,
        options.rowSelector,
        options.readItem,
        clientY
      );
      if (!target) {
        return toPublicTarget(validatePreview());
      }

      container.querySelectorAll(`[${DROP_EDGE_ATTRIBUTE}]`).forEach((element) => {
        if (element !== target.element) {
          element.removeAttribute(DROP_EDGE_ATTRIBUTE);
        }
      });
      target.element.setAttribute(DROP_EDGE_ATTRIBUTE, target.edge);
      previewRef.current = target;
      return toPublicTarget(target);
    },
    [options.containerRef, options.readItem, options.rowSelector, validatePreview]
  );

  const getPreviewTarget = React.useCallback(
    (): ItemDropTarget<T> | null => toPublicTarget(validatePreview()),
    [validatePreview]
  );

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) {
        return;
      }
      clearPreview();
    },
    [clearPreview]
  );

  React.useLayoutEffect(() => {
    validatePreview();
  });

  React.useEffect(() => clearPreview, [clearPreview]);

  return React.useMemo(
    () => ({ previewAt, getPreviewTarget, clearPreview, handleDragLeave }),
    [previewAt, getPreviewTarget, clearPreview, handleDragLeave]
  );
}

function resolveVerticalTarget<T>(
  container: HTMLElement,
  rowSelector: string,
  readItem: (row: HTMLElement) => T | null,
  clientY: number
): ElementDropTarget<T> | null {
  const rows = Array.from(container.querySelectorAll<HTMLElement>(rowSelector));
  const validRows = rows.flatMap((element) => {
    const item = readItem(element);
    return item === null ? [] : [{ element, item }];
  });
  if (validRows.length === 0 || !Number.isFinite(clientY)) {
    return null;
  }

  for (let index = 0; index < validRows.length; index += 1) {
    const row = validRows[index];
    const rect = row.element.getBoundingClientRect();
    if (clientY < rect.top) {
      return { ...row, edge: "before" };
    }
    if (clientY <= rect.bottom) {
      return {
        ...row,
        edge: clientY < rect.top + rect.height / 2 ? "before" : "after"
      };
    }

    const next = validRows[index + 1];
    if (next && clientY < next.element.getBoundingClientRect().top) {
      return { ...row, edge: "after" };
    }
  }

  const last = validRows[validRows.length - 1];
  return { ...last, edge: "after" };
}

function toPublicTarget<T>(target: ElementDropTarget<T> | null): ItemDropTarget<T> | null {
  return target ? { item: target.item, edge: target.edge } : null;
}
