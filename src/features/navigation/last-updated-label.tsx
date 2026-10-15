import * as React from "react";

export function formatLastUpdated(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 5) return "gerade eben";
  if (seconds < 60) return `vor ${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

export function LastUpdatedLabel({ timestamp, loading = false, failed = false, cached = false }: {
  timestamp: number | null; loading?: boolean; failed?: boolean; cached?: boolean;
}): React.ReactElement | null {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    if (timestamp === null) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [timestamp]);
  const hasTimestamp = timestamp !== null && Number.isFinite(timestamp);
  const status = loading ? hasTimestamp ? 'Wird aktualisiert …' : 'Daten werden geladen …'
    : failed ? hasTimestamp ? 'Aktualisierung fehlgeschlagen · Alter Stand' : 'Aktualisierung fehlgeschlagen'
    : cached && hasTimestamp ? 'Gespeicherter Stand' : '';
  if (!hasTimestamp && !status) return null;
  return <div className="ui-shell-data-freshness">
    {hasTimestamp && <time className="ui-shell-last-updated" dateTime={new Date(timestamp!).toISOString()}
    title={new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(timestamp)}>
    {cached ? 'Datenstand' : 'Aktualisiert'} {formatLastUpdated(timestamp!, now)}
  </time>}
    <span className="ui-shell-data-state" data-failed={failed && !loading || undefined} role="status" aria-live="polite" aria-atomic="true">{status}</span>
  </div>;
}
