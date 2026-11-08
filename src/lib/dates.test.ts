import { describe, expect, it } from "vitest";
import { formatLongDate, formatRelativeTime, formatShortDate } from "@/lib/dates";

const sunday = new Date(2026, 10, 8);

describe("formatLongDate", () => {
  it("formats in Portuguese with a capitalized weekday", () => {
    expect(formatLongDate(sunday, "pt-BR")).toBe("Domingo, 8 de novembro");
  });

  it("formats in English", () => {
    expect(formatLongDate(sunday, "en")).toBe("Sunday, November 8");
  });
});

describe("formatShortDate", () => {
  it("formats a medium date in Portuguese", () => {
    expect(formatShortDate(sunday, "pt-BR")).toBe("8 de nov. de 2026");
  });

  it("formats a medium date in English", () => {
    expect(formatShortDate(sunday, "en")).toBe("Nov 8, 2026");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 10, 8, 12, 0, 0);

  function secondsAgo(seconds: number): Date {
    return new Date(now.getTime() - seconds * 1000);
  }

  it.each([
    [30, "now"],
    [12 * 60, "12 minutes ago"],
    [60, "1 minute ago"],
    [3 * 60 * 60, "3 hours ago"],
    [24 * 60 * 60, "yesterday"],
    [3 * 24 * 60 * 60, "3 days ago"],
    [21 * 24 * 60 * 60, "3 weeks ago"],
    [65 * 24 * 60 * 60, "2 months ago"],
    [800 * 24 * 60 * 60, "2 years ago"],
  ])("describes %i seconds ago in English as %s", (seconds, expected) => {
    expect(formatRelativeTime(secondsAgo(seconds), now, "en")).toBe(expected);
  });

  it.each([
    [30, "agora"],
    [12 * 60, "há 12 minutos"],
    [24 * 60 * 60, "ontem"],
    [21 * 24 * 60 * 60, "há 3 semanas"],
  ])("describes %i seconds ago in Portuguese as %s", (seconds, expected) => {
    expect(formatRelativeTime(secondsAgo(seconds), now, "pt-BR")).toBe(expected);
  });

  it("describes a future date", () => {
    const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    expect(formatRelativeTime(inTwoDays, now, "en")).toBe("in 2 days");
  });

  it("treats the same instant as now", () => {
    expect(formatRelativeTime(now, now, "en")).toBe("now");
  });
});
