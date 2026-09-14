// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationToast } from './notification-toast.js';
import { createTransientNotification } from './transient-notification.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Notification overlay', () => {
  it.each([['success', 'status', 2000], ['error', 'alert', 5000]] as const)(
    'dismisses %s messages (role: %s) after exactly %i milliseconds', (severity, role, duration) => {
      render(<NotificationToast notification={createTransientNotification('Meldung', severity)}/>);
      act(() => vi.advanceTimersByTime(duration - 1));
      expect(screen.queryByRole(role)?.textContent).toContain('Meldung');
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole(role)).toBeNull();
    }
  );

  it('replaces messages without stacking or letting an older timer dismiss a new message', () => {
    const view = render(<NotificationToast notification={createTransientNotification('Erster Durchlauf', 'success')}/>);
    act(() => vi.advanceTimersByTime(1500));
    view.rerender(<NotificationToast notification={createTransientNotification('Zweiter Durchlauf', 'success')}/>);
    expect(screen.queryByText('Erster Durchlauf')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByText('Zweiter Durchlauf')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows repeated identical events but does not extend expiry for unrelated renders', () => {
    let notification = createTransientNotification('Auf Active zurückgesetzt.', 'success');
    const view = render(<NotificationToast notification={notification}/>);
    act(() => vi.advanceTimersByTime(2000));
    notification = createTransientNotification(notification.message, 'success');
    view.rerender(<NotificationToast notification={notification}/>);
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(<NotificationToast notification={notification}/>);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not replay expired messages after remount and cleans up timers', () => {
    const notification = createTransientNotification('Bestätigt', 'success');
    const view = render(<NotificationToast notification={notification}/>);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    render(<NotificationToast notification={notification}/>);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('can be dismissed manually without reappearing on a rerender', () => {
    const notification = createTransientNotification('Fehler beim Speichern', 'error');
    const view = render(<NotificationToast notification={notification}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Meldung schließen' }));
    view.rerender(<NotificationToast notification={notification}/>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
