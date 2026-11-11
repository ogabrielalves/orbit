import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteEntry } from "@/bindings";
import { Sidebar } from "@/components/organisms/Sidebar";
import { i18next } from "@/i18n";
import { renderWithRouter } from "@/test/renderWithRouter";

function favorite(overrides: Partial<FavoriteEntry>): FavoriteEntry {
  return {
    entityType: "project",
    entityId: "p1",
    title: "Website",
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
    isArchived: false,
    createdAt: "2026-11-08T12:00:00Z",
    ...overrides,
  };
}

const favorites: FavoriteEntry[] = [
  favorite({ entityId: "p1", title: "Website" }),
  favorite({ entityId: "p2", title: "Thesis" }),
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

  it("lists the favorites with a link to each one", async () => {
    renderSidebar({ favorites });
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    const link = within(sidebar).getByRole("link", { name: "Website" });

    expect(link).toHaveAttribute("href", "/projects/p1");
    expect(within(sidebar).getByRole("link", { name: "Thesis" })).toBeInTheDocument();
    expect(screen.getAllByText("Favorites")).toHaveLength(2);
  });

  it("links each kind of favorite to its page", async () => {
    renderSidebar({
      favorites: [
        favorite({ entityType: "board", entityId: "b1", title: "Sprint" }),
        favorite({ entityType: "task", entityId: "t1", title: "Fix bug", boardId: "b1" }),
        favorite({ entityType: "task", entityId: "t2", title: "Someday" }),
        favorite({
          entityType: "task",
          entityId: "s1",
          title: "Sub",
          boardId: "b1",
          parentTaskId: "t1",
        }),
        favorite({ entityType: "note", entityId: "n1", title: "Ideas" }),
        favorite({ entityType: "folder", entityId: "work", title: "Work", path: "work" }),
      ],
    });
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    expect(within(sidebar).getByRole("link", { name: "Sprint" })).toHaveAttribute(
      "href",
      "/boards/b1",
    );
    expect(within(sidebar).getByRole("link", { name: "Fix bug" })).toHaveAttribute(
      "href",
      "/boards/b1?task=t1",
    );
    expect(within(sidebar).getByRole("link", { name: "Someday" })).toHaveAttribute(
      "href",
      "/backlog?task=t2",
    );
    expect(within(sidebar).getByRole("link", { name: "Sub" })).toHaveAttribute(
      "href",
      "/boards/b1?task=t1",
    );
    expect(within(sidebar).getByRole("link", { name: "Ideas" })).toHaveAttribute(
      "href",
      "/notes/n1",
    );
    expect(within(sidebar).getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/notes?folder=work",
    );
  });

  it("hides archived favorites and shows at most eight", async () => {
    renderSidebar({
      favorites: [
        favorite({ entityId: "old", title: "Old one", isArchived: true }),
        ...Array.from({ length: 10 }, (_, index) =>
          favorite({ entityId: `p${index}`, title: `Project ${index}` }),
        ),
      ],
    });
    const sidebar = await screen.findByRole("navigation", { name: "Main navigation" });

    expect(within(sidebar).queryByRole("link", { name: "Old one" })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Project 7" })).toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "Project 8" })).not.toBeInTheDocument();
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
