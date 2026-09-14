import * as React from 'react';
import {
  MATRIX_TITLE_COLUMN_WIDTH_STEP,
  MAX_MATRIX_TITLE_COLUMN_WIDTH,
  MIN_MATRIX_TITLE_COLUMN_WIDTH,
  sanitizeMatrixTitleColumnWidth
} from '../../domain/release-matrix/matrix-config.js';

type DragState = {
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
};

export function useMatrixTitleColumnResize(configuredWidth: number, commit: (width: number) => void) {
  const normalizedWidth = sanitizeMatrixTitleColumnWidth(configuredWidth);
  const [width, setWidth] = React.useState(normalizedWidth);
  const drag = React.useRef<DragState | null>(null);

  React.useEffect(() => {
    if (!drag.current) setWidth(normalizedWidth);
  }, [normalizedWidth]);

  const finishPointerResize = (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) {
      setWidth(normalizedWidth);
      return;
    }
    if (current.width !== normalizedWidth) commit(current.width);
  };

  const handleProps = {
    role: 'separator',
    tabIndex: 0,
    'aria-label': 'Breite der Testfallspalte ändern',
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': MIN_MATRIX_TITLE_COLUMN_WIDTH,
    'aria-valuemax': MAX_MATRIX_TITLE_COLUMN_WIDTH,
    'aria-valuenow': width,
    'aria-valuetext': `${width} Pixel`,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, width };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.width = sanitizeMatrixTitleColumnWidth(current.startWidth + event.clientX - current.startX);
      setWidth(current.width);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => finishPointerResize(event, false),
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => finishPointerResize(event, true),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = sanitizeMatrixTitleColumnWidth(width + (event.key === 'ArrowRight' ? MATRIX_TITLE_COLUMN_WIDTH_STEP : -MATRIX_TITLE_COLUMN_WIDTH_STEP));
      setWidth(next);
      if (next !== normalizedWidth) commit(next);
    }
  };

  return { width, handleProps };
}
