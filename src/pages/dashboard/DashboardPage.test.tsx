import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [6, "Good morning"],
    [14, "Good afternoon"],
    [21, "Good evening"],
  ])("greets at %i:00 with %s", async (hour, greeting) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, hour, 0));

    renderApp("/");

    expect(await screen.findByRole("heading", { level: 1, name: greeting })).toBeInTheDocument();
  });

  it("shows the greeting with the display title size", async () => {
    renderApp("/");

    const heading = await screen.findByRole("heading", { level: 1 });

    expect(heading).toHaveClass("text-title");
  });
});
