import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/templates/AppShell";

describe("AppShell", () => {
  it("renders the sidebar, topbar and page content", () => {
    render(
      <AppShell sidebar={<nav aria-label="Side" />} topbar={<header>Top</header>}>
        <p>Content</p>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Side" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Top");
    expect(within(screen.getByRole("main")).getByText("Content")).toBeInTheDocument();
  });

  it("renders without a sidebar", () => {
    render(
      <AppShell sidebar={null} topbar={<header>Top</header>}>
        <p>Content</p>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("uses the larger vertical padding from the desktop breakpoint", () => {
    render(
      <AppShell sidebar={null} topbar={null}>
        <p>Content</p>
      </AppShell>,
    );

    expect(screen.getByRole("main")).toHaveClass("py-6", "lg:py-8");
  });
});
