import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type FavoriteEntry } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const listFavorites = vi.mocked(commands.listFavorites);
const toggleFavorite = vi.mocked(commands.toggleFavorite);

function entry(overrides: Partial<FavoriteEntry>): FavoriteEntry {
  return {
    entityType: "project",
    entityId: "p1",
    title: "Website 2.0",
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

function mockFavorites(entries: FavoriteEntry[]) {
  listFavorites.mockResolvedValue({ status: "ok", data: entries });
}

describe("FavoritesPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    listFavorites.mockReset();
    toggleFavorite.mockReset();
    mockFavorites([]);
  });

  it("shows a loading placeholder while the favorites load", async () => {
    listFavorites.mockReturnValue(new Promise(() => undefined));
    renderApp("/favorites");

    const loading = await screen.findAllByRole("status");

    expect(loading[0]).toHaveTextContent("Loading…");
  });

  it("shows the empty state", async () => {
    renderApp("/favorites");

    expect(await screen.findByRole("heading", { name: "No favorites yet" })).toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    let shouldFail = true;
    listFavorites.mockImplementation(async () =>
      shouldFail
        ? { status: "error", error: { code: "DATABASE", message: "x" } }
        : { status: "ok", data: [] },
    );
    renderApp("/favorites");

    expect(await screen.findByText("Could not load the favorites")).toBeInTheDocument();
    shouldFail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "No favorites yet" })).toBeInTheDocument();
  });

  it("groups the favorites by type in a fixed order with a count", async () => {
    mockFavorites([
      entry({ entityType: "note", entityId: "n1", title: "Ideas" }),
      entry({ entityType: "project", entityId: "p1", title: "Website 2.0" }),
      entry({ entityType: "folder", entityId: "work", title: "Work", path: "work" }),
      entry({ entityType: "project", entityId: "p2", title: "Thesis" }),
    ]);
    renderApp("/favorites");

    await screen.findByRole("heading", { level: 2, name: "Projects" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((item) => item.textContent);
    expect(headings).toEqual(["Projects", "Notes", "Folders"]);
    const projects = within(screen.getByRole("region", { name: "Projects" }));
    expect(projects.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Website 2.0",
      "Thesis",
    ]);
    expect(screen.getByText("4 favorites")).toBeInTheDocument();
  });

  it("links each favorite to its page", async () => {
    mockFavorites([
      entry({ entityType: "board", entityId: "b1", title: "Sprint" }),
      entry({ entityType: "task", entityId: "t1", title: "Fix bug", boardId: "b1" }),
      entry({ entityType: "task", entityId: "t2", title: "Someday" }),
      entry({ entityType: "note", entityId: "n1", title: "Ideas" }),
      entry({ entityType: "folder", entityId: "work", title: "Work", path: "work" }),
    ]);
    renderApp("/favorites");
    const content = within(await screen.findByRole("main"));

    expect(await content.findByRole("link", { name: "Sprint" })).toHaveAttribute(
      "href",
      "/boards/b1",
    );
    expect(content.getByRole("link", { name: "Fix bug" })).toHaveAttribute(
      "href",
      "/boards/b1?task=t1",
    );
    expect(content.getByRole("link", { name: "Someday" })).toHaveAttribute(
      "href",
      "/backlog?task=t2",
    );
    expect(content.getByRole("link", { name: "Ideas" })).toHaveAttribute("href", "/notes/n1");
    expect(content.getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/notes?folder=work",
    );
  });

  it("shows the context and flags archived favorites", async () => {
    mockFavorites([
      entry({
        entityType: "task",
        entityId: "t1",
        title: "Fix bug",
        context: "Website 2.0",
        boardId: "b1",
        isArchived: true,
      }),
    ]);
    renderApp("/favorites");

    const row = (await screen.findByRole("link", { name: "Fix bug" })).closest("li");
    expect(row).toHaveTextContent("Website 2.0");
    expect(row).toHaveTextContent("Archived");
  });

  it("removes a favorite with its star", async () => {
    mockFavorites([entry({ entityType: "note", entityId: "n1", title: "Ideas" })]);
    toggleFavorite.mockResolvedValue({ status: "ok", data: false });
    renderApp("/favorites");

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove from favorites: Ideas" }),
    );

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "note", entityId: "n1" }),
    );
  });

  it("offers a drag handle to reorder each favorite", async () => {
    mockFavorites([entry({ title: "Website 2.0" })]);
    renderApp("/favorites");

    expect(await screen.findByRole("button", { name: "Reorder Website 2.0" })).toBeInTheDocument();
  });
});
