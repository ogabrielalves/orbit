import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/hooks/useUiStore";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";
import { setViewportWidth } from "@/test/viewport";

describe("routes", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["/projects", "My projects"],
    ["/projects/abc", "My projects"],
    ["/boards/abc", "Boards"],
    ["/backlog", "Backlog"],
    ["/notes", "Notes"],
    ["/notes/abc", "Notes"],
    ["/graph", "Graph"],
    ["/favorites", "Favorites"],
    ["/settings", "Settings"],
  ])("renders %s with the %s heading", async (path, title) => {
    renderApp(path);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("renders the not found page for unknown paths", async () => {
    renderApp("/does-not-exist");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("greets by time of day on the dashboard without a name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 9, 0));

    renderApp("/");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Good morning" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday, November 8")).toBeInTheDocument();
  });

  it("shows the current page in the breadcrumb", async () => {
    renderApp("/backlog");

    const breadcrumb = await screen.findByRole("navigation", { name: "Breadcrumb" });

    expect(within(breadcrumb).getByText("Backlog")).toHaveAttribute("aria-current", "page");
  });
});

describe("navigation", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  it("navigates when a sidebar link is clicked and marks it as current", async () => {
    renderApp("/");
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    await userEvent.click(within(sidebar).getByRole("link", { name: "Notes" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Notes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not mark the dashboard as current on other pages", async () => {
    renderApp("/settings");
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("sidebar responsiveness", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  it("collapses and expands from the toggle button on desktop", async () => {
    renderApp("/");

    await userEvent.click(await screen.findByRole("button", { name: "Collapse menu" }));
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand menu" }));
    expect(screen.getByRole("button", { name: "Collapse menu" })).toBeInTheDocument();
  });

  it("collapses with Ctrl+\\", async () => {
    renderApp("/");
    await screen.findByRole("button", { name: "Collapse menu" });

    await userEvent.keyboard("{Control>}\\{/Control}");

    expect(await screen.findByRole("button", { name: "Expand menu" })).toBeInTheDocument();
  });

  it("keeps link names reachable when collapsed", async () => {
    useUiStore.setState({ isSidebarCollapsed: true });
    renderApp("/");

    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    expect(within(sidebar).getByRole("link", { name: "My projects" })).toBeInTheDocument();
  });

  it("forces the collapsed sidebar without a toggle on tablet", async () => {
    setViewportWidth(900);
    renderApp("/");

    await screen.findByRole("navigation", { name: "Main navigation" });

    expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("hides the sidebar on mobile", async () => {
    setViewportWidth(600);
    renderApp("/");

    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  });
});
