import { describe, it, expect, afterEach, vi } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-08-30T12:00:00Z");

function ago(ms: number) {
  return new Date(NOW.getTime() - ms);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

afterEach(() => {
  vi.useRealTimers();
});

function at(now: Date) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [30 * SECOND, "just now"],
    [59 * SECOND, "just now"],
  ])("renders %dms as %s", (offset, expected) => {
    at(NOW);
    expect(formatRelativeTime(ago(offset))).toBe(expected);
  });

  describe("boundaries between units", () => {
    // Each unit's first and last value, so an off-by-one in a threshold shows up
    // as a wrong unit rather than a plausible-looking number.
    it.each([
      [1 * MINUTE, "1m ago"],
      [59 * MINUTE, "59m ago"],
      [1 * HOUR, "1h ago"],
      [23 * HOUR + 59 * MINUTE, "23h ago"],
      [1 * DAY, "1d ago"],
      [6 * DAY, "6d ago"],
      [365 * DAY, "365d ago"],
    ])("renders %dms as %s", (offset, expected) => {
      at(NOW);
      expect(formatRelativeTime(ago(offset))).toBe(expected);
    });
  });

  it("accepts an ISO string as well as a Date", () => {
    at(NOW);
    expect(formatRelativeTime(ago(2 * HOUR).toISOString())).toBe("2h ago");
  });

  it("truncates rather than rounds", () => {
    // 90 minutes is 1h, not 2h — reporting a sync as more recent or more stale
    // than it is undermines the point of showing it.
    at(NOW);
    expect(formatRelativeTime(ago(90 * MINUTE))).toBe("1h ago");
  });

  it("treats a future timestamp as just now rather than a negative age", () => {
    // Clock skew between the server and the browser can put a sync timestamp
    // slightly ahead; "-1m ago" would read as a bug.
    at(NOW);
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * MINUTE))).toBe("just now");
  });
});
