import { describe, expect, it } from "vitest";
import { formatLongDate } from "@/lib/dates";

const sunday = new Date(2026, 10, 8);

describe("formatLongDate", () => {
  it("formats in Portuguese with a capitalized weekday", () => {
    expect(formatLongDate(sunday, "pt-BR")).toBe("Domingo, 8 de novembro");
  });

  it("formats in English", () => {
    expect(formatLongDate(sunday, "en")).toBe("Sunday, November 8");
  });
});
