// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatLastUpdated, LastUpdatedLabel } from './last-updated-label.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('formats relative update times in German', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  expect(formatLastUpdated(now, now)).toBe('gerade eben');
  expect(formatLastUpdated(now - 60_000, now)).toBe('vor 1 Min.');
  expect(formatLastUpdated(now - 3 * 3_600_000, now)).toBe('vor 3 Std.');
  expect(formatLastUpdated(now - 2 * 86_400_000, now)).toBe('vor 2 Tagen');
});

it('updates the relative label as time passes', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
  const timestamp = Date.now();
  render(<LastUpdatedLabel timestamp={timestamp}/>);
  expect(screen.getByText('Aktualisiert gerade eben')).toBeDefined();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText('Aktualisiert vor 1 Min.')).toBeDefined();
});
