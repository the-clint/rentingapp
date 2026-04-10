/**
 * Pure relative-time formatter for listing `created_at` timestamps. Buckets:
 *
 *   < 60 seconds → "just now"
 *   < 60 minutes → "N minute(s) ago"
 *   < 24 hours   → "N hour(s) ago"
 *   < 30 days    → "N day(s) ago"
 *   ≥ 30 days    → "on YYYY-MM-DD"
 *
 * Future timestamps (`delta < 0`) fall back to "just now" defensively —
 * the DB never produces future `created_at` values in practice, but tests
 * and malformed data must not throw.
 *
 * Intentionally does not use `Intl.RelativeTimeFormat` — the bucket
 * thresholds (30-day cutover to absolute date) differ from Intl's defaults.
 * Named export only, no dependencies.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const delta = now.getTime() - new Date(iso).getTime();

  if (delta < 60_000) {
    return "just now";
  }

  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) {
    return pluralize(minutes, "minute");
  }

  const hours = Math.floor(delta / 3_600_000);
  if (hours < 24) {
    return pluralize(hours, "hour");
  }

  const days = Math.floor(delta / 86_400_000);
  if (days < 30) {
    return pluralize(days, "day");
  }

  return `on ${new Date(iso).toISOString().slice(0, 10)}`;
}

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
