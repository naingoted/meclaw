// Pure date/time formatting for the chat transcript. Locale-aware via Intl.

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** "Today" / "Yesterday" / a short "Mon D" date, relative to `now`. */
export function formatDayLabel(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return "Today";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const yesterday = start.getTime() - 1; // any ms inside the prior day
  if (isSameDay(ts, yesterday)) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
