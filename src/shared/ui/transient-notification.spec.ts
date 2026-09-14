import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTransientNotification } from './transient-notification.js';

afterEach(() => vi.useRealTimers());
describe('Transient notification events', () => {
  it('expires confirmations after two seconds and errors after five seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    expect(createTransientNotification('Gespeichert', 'success').expiresAt).toBe(12000);
    expect(createTransientNotification('Speichern fehlgeschlagen', 'error').expiresAt).toBe(15000);
  });

  it('distinguishes repeated messages even within the same millisecond', () => {
    const first = createTransientNotification('Auf Active zurückgesetzt.', 'success');
    const second = createTransientNotification(first.message, first.severity);
    expect(second.id).toBeGreaterThan(first.id);
  });
});
