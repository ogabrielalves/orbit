import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createAppRouter } from "@/app/router";
import { useUiStore } from "@/hooks/useUiStore";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

describe("route preloading", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  it("preloads a route when the user shows intent", () => {
    expect(createAppRouter().options.defaultPreload).toBe("intent");
  });

  it("still navigates after hovering a link", async () => {
    const router = renderApp("/");
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });
    const link = within(sidebar).getByRole("link", { name: "Graph" });

    await userEvent.hover(link);
    await userEvent.click(link);

    expect(await screen.findByRole("heading", { level: 1, name: "Graph" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/graph");
  });

  it("keeps the current page when a link is hovered and left", async () => {
    const router = renderApp("/");
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });
    const link = within(sidebar).getByRole("link", { name: "Settings" });

    await userEvent.hover(link);
    await userEvent.unhover(link);

    expect(router.state.location.pathname).toBe("/");
  });
});
