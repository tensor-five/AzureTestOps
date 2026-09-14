export type TransientNotification = {
  id: number;
  message: string;
  severity: 'success' | 'error';
  expiresAt: number;
};

let nextId = 0;

/** Expiry belongs to the event, so remounting cannot replay old messages. */
export function createTransientNotification(
  message: string,
  severity: TransientNotification['severity']
): TransientNotification {
  return { id: ++nextId, message, severity, expiresAt: Date.now() + (severity === 'error' ? 5000 : 2000) };
}
