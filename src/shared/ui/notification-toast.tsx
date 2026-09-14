import * as React from 'react';
import type { TransientNotification } from './transient-notification.js';
import './notification-toast.css';

export function NotificationToast({ notification }: { notification: TransientNotification | null | undefined }) {
  const [dismissedId, dismiss] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => dismiss(notification.id), Math.max(0, notification.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification || notification.id === dismissedId || notification.expiresAt <= Date.now()) return null;
  const error = notification.severity === 'error';
  return <div className="notification-toast" data-severity={notification.severity}>
    <div role={error ? 'alert' : 'status'} aria-atomic="true">
      <strong>{error ? 'Fehler' : 'Bestätigung'}</strong>
      <div>{notification.message}</div>
    </div>
    <button type="button" className="u-btn" aria-label="Meldung schließen" onClick={() => dismiss(notification.id)}>×</button>
  </div>;
}
