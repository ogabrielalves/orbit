import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar, type SidebarFavorite } from "@/components/organisms/Sidebar";
import { i18next } from "@/i18n";
import { renderWithRouter } from "@/test/renderWithRouter";

const favorites: SidebarFavorite[] = [
  { id: "p1", name: "Website", color: "rgb(59, 79, 228)" },
  { id: "p2", name: "Thesis", color: "rgb(14, 138, 130)" },
];

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const onToggle = vi.fn();
  renderWithRouter(
    <Sidebar isCollapsed={false} canToggle onToggle={onToggle} favorites={[]} {...props} />,
  );
  return { onToggle };
}

describe("Sidebar", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("lists the main destinations and settings", async () => {
    renderSidebar();
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    for (const name of [
      "Dashboard",
      "My projects",
      "Backlog",
      "Notes",
      "Graph",
      "Favorites",
      "Settings",
    ]) {
      expect(within(sidebar).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("hides the favorites section when there are no favorites", async () => {
    renderSidebar();
    await screen.findByRole("navigation", { name: "Main navigation" });

    expect(screen.getAllByText("Favorites")).toHaveLength(1);
  });

  it("lists favorite projects with their initial", async () => {
    renderSidebar({ favorites });
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    const link = within(sidebar).getByRole("link", { name: "Website" });

    expect(link).toHaveAttribute("href", "/projects/p1");
    expect(within(link).getByText("W")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Thesis" })).toBeInTheDocument();
    expect(screen.getAllByText("Favorites")).toHaveLength(2);
  });

  it("calls onToggle when the collapse button is clicked", async () => {
    const { onToggle } = renderSidebar();

    await userEvent.click(await screen.findByRole("button", { name: "Collapse menu" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("offers to expand when collapsed", async () => {
    renderSidebar({ isCollapsed: true });

    expect(await screen.findByRole("button", { name: "Expand menu" })).toBeInTheDocument();
  });

  it("omits the toggle when it cannot be toggled", async () => {
    renderSidebar({ canToggle: false });
    await screen.findByRole("navigation", { name: "Main navigation" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the app wordmark only when expanded", async () => {
    renderSidebar();
    expect(await screen.findByText("orbit")).toBeInTheDocument();
  });
});
