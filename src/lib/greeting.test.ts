import { describe, expect, it } from "vitest";
import { getGreetingPeriod } from "@/lib/greeting";

function atHour(hour: number, minute = 0): Date {
  return new Date(2026, 10, 8, hour, minute);
}

describe("getGreetingPeriod", () => {
  it.each([
    [5, 0, "morning"],
    [11, 59, "morning"],
    [12, 0, "afternoon"],
    [17, 59, "afternoon"],
    [18, 0, "evening"],
    [23, 59, "evening"],
    [0, 0, "evening"],
    [4, 59, "evening"],
  ] as const)("returns the right period at %i:%i", (hour, minute, expected) => {
    expect(getGreetingPeriod(atHour(hour, minute))).toBe(expected);
  });
});
