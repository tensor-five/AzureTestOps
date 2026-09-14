import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATRIX_TITLE_COLUMN_WIDTH,
  MAX_MATRIX_TITLE_COLUMN_WIDTH,
  MIN_MATRIX_TITLE_COLUMN_WIDTH,
  emptyMatrixConfig,
  sanitizeMatrixConfig,
  sanitizeMatrixTitleColumnWidth
} from './matrix-config.js';

describe('Release matrix title-column width', () => {
  it('gives older preferences the default width', () => {
    const config = emptyMatrixConfig(1, 10);
    const { testCaseColumnWidth: _width, ...withoutWidth } = config;
    expect(sanitizeMatrixConfig(withoutWidth)?.testCaseColumnWidth).toBe(DEFAULT_MATRIX_TITLE_COLUMN_WIDTH);
  });

  it('rounds and clamps persisted widths to the supported range', () => {
    expect(sanitizeMatrixTitleColumnWidth(MIN_MATRIX_TITLE_COLUMN_WIDTH - 1)).toBe(MIN_MATRIX_TITLE_COLUMN_WIDTH);
    expect(sanitizeMatrixTitleColumnWidth(511.7)).toBe(512);
    expect(sanitizeMatrixTitleColumnWidth(MAX_MATRIX_TITLE_COLUMN_WIDTH + 1)).toBe(MAX_MATRIX_TITLE_COLUMN_WIDTH);
    expect(sanitizeMatrixTitleColumnWidth('512')).toBe(DEFAULT_MATRIX_TITLE_COLUMN_WIDTH);
  });
});
