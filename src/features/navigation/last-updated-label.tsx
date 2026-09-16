import * as React from "react";

export function formatLastUpdated(timestamp: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

export function LastUpdatedLabel({ timestamp }: { timestamp: number | null }): React.ReactElement | null {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    if (timestamp === null) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [timestamp]);
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  return <time className="ui-shell-last-updated" dateTime={new Date(timestamp).toISOString()}
    title={new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(timestamp)}>
    Aktualisiert {formatLastUpdated(timestamp, now)}
  </time>;
}
