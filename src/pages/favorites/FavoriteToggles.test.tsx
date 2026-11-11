import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type FavoriteEntry, type NoteDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Note body" />,
}));

const listFavorites = vi.mocked(commands.listFavorites);
const toggleFavorite = vi.mocked(commands.toggleFavorite);
const getProject = vi.mocked(commands.getProject);
const listProjects = vi.mocked(commands.listProjects);
const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);

let favorites: FavoriteEntry[] = [];

function entry(entityType: FavoriteEntry["entityType"], entityId: string): FavoriteEntry {
  return {
    entityType,
    entityId,
    title: entityId,
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
    isArchived: false,
    createdAt: "2026-11-08T12:00:00Z",
  };
}

const note: NoteDetails = {
  id: "n1",
  path: "Ideas.md",
  title: "Ideas",
  tags: [],
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T10:00:00Z",
  content: "# Ideas",
  hash: "h1",
};

describe("favorite toggles", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    favorites = [];
    for (const command of [
      listFavorites,
      toggleFavorite,
      getProject,
      listProjects,
      getBoard,
      listBoardTasks,
      getTask,
      getVaultStatus,
      listFolders,
      listNotes,
      getNote,
    ]) {
      command.mockReset();
    }
    listFavorites.mockImplementation(async () => ({ status: "ok", data: favorites }));
    toggleFavorite.mockImplementation(async (reference) => {
      const wasFavorite = favorites.some(
        (item) => item.entityType === reference.entityType && item.entityId === reference.entityId,
      );
      favorites = wasFavorite
        ? favorites.filter(
            (item) =>
              !(item.entityType === reference.entityType && item.entityId === reference.entityId),
          )
        : [...favorites, entry(reference.entityType, reference.entityId)];
      return { status: "ok", data: !wasFavorite };
    });
    listProjects.mockResolvedValue({ status: "ok", data: [] });
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({
      status: "ok",
      data: [{ path: "work", name: "work", noteCount: 0 }],
    });
    listNotes.mockResolvedValue({ status: "ok", data: [note] });
    getNote.mockResolvedValue({ status: "ok", data: note });
  });

  it("stars and unstars a project from its page", async () => {
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1", name: "Website 2.0" }),
        boards: [],
        taskCount: 0,
        backlogTaskCount: 0,
      },
    });
    renderApp("/projects/p1");

    const add = await screen.findByRole("button", { name: "Add to favorites: Website 2.0" });
    expect(add).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(add);

    const remove = await screen.findByRole("button", {
      name: "Remove from favorites: Website 2.0",
    });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "project", entityId: "p1" });

    await userEvent.click(remove);

    expect(
      await screen.findByRole("button", { name: "Add to favorites: Website 2.0" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a project already in the favorites as starred", async () => {
    favorites = [entry("project", "p1")];
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1", name: "Website 2.0" }),
        boards: [],
        taskCount: 0,
        backlogTaskCount: 0,
      },
    });
    renderApp("/projects/p1");

    expect(
      await screen.findByRole("button", { name: "Remove from favorites: Website 2.0" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("stars a project from its card in the list", async () => {
    listProjects.mockResolvedValue({
      status: "ok",
      data: [createProjectFixture({ id: "p1", name: "Website 2.0" })],
    });
    renderApp("/projects");

    await userEvent.click(
      await screen.findByRole("button", { name: "Add to favorites: Website 2.0" }),
    );

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "project", entityId: "p1" }),
    );
  });

  it("stars a board from its header", async () => {
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [] });
    renderApp("/boards/b1");

    await userEvent.click(
      await screen.findByRole("button", { name: "Add to favorites: Sprint 14" }),
    );

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "board", entityId: "b1" }),
    );
  });

  it("stars a task from its drawer", async () => {
    const task = createTaskFixture({ id: "t1", title: "Write the spec" });
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    getTask.mockResolvedValue({ status: "ok", data: task });
    renderApp("/boards/b1?task=t1");

    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    await userEvent.click(
      await within(drawer).findByRole("button", { name: "Add to favorites: Write the spec" }),
    );

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "task", entityId: "t1" }),
    );
  });

  it("stars a note from the editor", async () => {
    renderApp("/notes/n1");

    await userEvent.click(await screen.findByRole("button", { name: "Add to favorites: Ideas" }));

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "note", entityId: "n1" }),
    );
  });

  it("stars a folder from its menu and offers to remove it afterwards", async () => {
    renderApp("/notes");

    await userEvent.click(await screen.findByRole("button", { name: "Actions for work" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Add to favorites" }));

    await waitFor(() =>
      expect(toggleFavorite).toHaveBeenCalledWith({ entityType: "folder", entityId: "work" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Actions for work" }));
    expect(
      await screen.findByRole("menuitem", { name: "Remove from favorites" }),
    ).toBeInTheDocument();
  });
});
