import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-04-09T12:00:00.000Z");

function isoMinus(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("formatRelativeTime", () => {
  it("returns 'just now' for 0 seconds delta", () => {
    expect(formatRelativeTime(NOW.toISOString(), NOW)).toBe("just now");
  });

  it("returns 'just now' for 45 seconds delta", () => {
    expect(formatRelativeTime(isoMinus(45_000), NOW)).toBe("just now");
  });

  it("returns '1 minute ago' at 90 seconds", () => {
    expect(formatRelativeTime(isoMinus(90_000), NOW)).toBe("1 minute ago");
  });

  it("returns '30 minutes ago' at 30 minutes", () => {
    expect(formatRelativeTime(isoMinus(30 * 60_000), NOW)).toBe(
      "30 minutes ago",
    );
  });

  it("returns '2 hours ago' at 2 hours", () => {
    expect(formatRelativeTime(isoMinus(2 * 3_600_000), NOW)).toBe(
      "2 hours ago",
    );
  });

  it("returns '1 hour ago' for the singular case", () => {
    expect(formatRelativeTime(isoMinus(3_600_000), NOW)).toBe("1 hour ago");
  });

  it("returns '3 days ago' at 3 days", () => {
    expect(formatRelativeTime(isoMinus(3 * 86_400_000), NOW)).toBe(
      "3 days ago",
    );
  });

  it("returns an absolute YYYY-MM-DD date past 30 days", () => {
    const iso = isoMinus(45 * 86_400_000);
    const expectedDate = new Date(iso).toISOString().slice(0, 10);
    expect(formatRelativeTime(iso, NOW)).toBe(`on ${expectedDate}`);
  });

  it("returns 'just now' defensively for future timestamps", () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe("just now");
  });
});
