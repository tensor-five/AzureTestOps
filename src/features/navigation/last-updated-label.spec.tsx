// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatLastUpdated, LastUpdatedLabel } from './last-updated-label.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('formats relative update times in German', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  expect(formatLastUpdated(now, now)).toBe('gerade eben');
  expect(formatLastUpdated(now - 45_000, now)).toBe('vor 45 Sek.');
  expect(formatLastUpdated(now - 60_000, now)).toBe('vor 1 Min.');
  expect(formatLastUpdated(now - 3 * 3_600_000, now)).toBe('vor 3 Std.');
  expect(formatLastUpdated(now - 2 * 86_400_000, now)).toBe('vor 2 Tagen');
});

it('keeps the original source time visible while refreshing cached data and after failure', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T07:00:45Z'));
  const timestamp = Date.parse('2026-10-15T07:00:00Z');
  const view = render(<LastUpdatedLabel timestamp={timestamp} cached loading/>);
  expect(screen.getByText('Datenstand vor 45 Sek.')).toBeDefined();
  expect(screen.getByRole('status').textContent).toBe('Wird aktualisiert …');
  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByText('Datenstand vor 50 Sek.')).toBeDefined();
  view.rerender(<LastUpdatedLabel timestamp={timestamp} cached failed/>);
  expect(screen.getByRole('status').textContent).toContain('Aktualisierung fehlgeschlagen · Alter Stand');
  expect(view.container.querySelector('time')?.dateTime).toBe(new Date(timestamp).toISOString());
  view.rerender(<LastUpdatedLabel timestamp={timestamp} cached/>);
  expect(screen.getByRole('status').textContent).toBe('Gespeicherter Stand');
});

it('shows first-load and error states without inventing an earlier data timestamp', () => {
  const view = render(<LastUpdatedLabel timestamp={null} loading/>);
  expect(screen.getByRole('status').textContent).toBe('Daten werden geladen …');
  expect(view.container.querySelector('time')).toBeNull();
  view.rerender(<LastUpdatedLabel timestamp={null} failed/>);
  expect(screen.getByRole('status').textContent).toBe('Aktualisierung fehlgeschlagen');
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
