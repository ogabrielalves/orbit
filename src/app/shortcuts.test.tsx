import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type NoteDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Note body" defaultValue="" />,
}));

const getSettings = vi.mocked(commands.getSettings);
const listProjects = vi.mocked(commands.listProjects);
const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);

const note: NoteDetails = {
  id: "n1",
  path: "Ideas.md",
  title: "Ideas",
  tags: [],
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T10:00:00Z",
  content: "",
  hash: "h1",
};

async function press(combo: string) {
  await userEvent.keyboard(`{Control>}{Shift>}${combo}{/Shift}{/Control}`);
}

describe("creation shortcuts", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [getSettings, listProjects, listNotes, getNote]) {
      command.mockReset();
    }
    getSettings.mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: "/vault", userName: "Gabriel" },
    });
    listProjects.mockResolvedValue({
      status: "ok",
      data: [createProjectFixture({ id: "p1", name: "Website 2.0" })],
    });
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({ status: "ok", data: [] });
    listNotes.mockResolvedValue({ status: "ok", data: [note] });
    getNote.mockResolvedValue({ status: "ok", data: note });
  });

  it("Ctrl+Shift+P opens the new project modal on the projects page", async () => {
    const router = renderApp("/");
    await screen.findByRole("heading", { level: 1 });

    await press("p");

    expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
  });

  it("Ctrl+Shift+N opens the new note modal on the notes page", async () => {
    const router = renderApp("/");
    await screen.findByRole("heading", { level: 1 });

    await press("n");

    expect(await screen.findByRole("dialog", { name: "New note" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/notes");
  });

  it("Ctrl+Shift+T opens the palette asking for the project of the new task", async () => {
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });

    await press("t");

    expect(await screen.findByText("Which project should get the task?")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Website 2.0" })).toBeInTheDocument();
  });

  it("Ctrl+Shift+B opens the palette asking for the project of the new board", async () => {
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });

    await press("b");

    expect(await screen.findByText("Which project should get the board?")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Website 2.0" })).toBeInTheDocument();
  });

  it("Escape in the project step goes back to the search, as when opened from the palette", async () => {
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });
    await press("t");
    await screen.findByText("Which project should get the task?");

    await userEvent.keyboard("{Escape}");

    expect(await screen.findByRole("option", { name: "New task" })).toBeInTheDocument();
  });

  it("works with the focus in a text field and does not type the letter", async () => {
    const router = renderApp("/projects");
    const field = await screen.findByRole("searchbox", { name: "Search projects" });
    await userEvent.click(field);
    expect(field).toHaveFocus();

    await press("n");

    expect(await screen.findByRole("dialog", { name: "New note" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/notes");
    expect(field).not.toBeInTheDocument();
  });

  it("keeps the search field empty when the shortcut fires inside it", async () => {
    renderApp("/projects");
    const field = await screen.findByRole("searchbox", { name: "Search projects" });
    await userEvent.click(field);

    await press("t");

    await screen.findByText("Which project should get the task?");
    expect(field).toBeInTheDocument();
    expect(field).toHaveValue("");
  });

  it("works with the focus inside the note editor without changing the text", async () => {
    const router = renderApp("/notes/n1");
    const body = await screen.findByRole("textbox", { name: "Note body" });
    await userEvent.click(body);

    await press("p");

    expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects");
    expect(body).toHaveValue("");
  });

  it("does nothing while a dialog is open", async () => {
    const router = renderApp("/");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Global search" });

    await press("p");

    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("dialog", { name: "New project" })).not.toBeInTheDocument();
  });

  it("does nothing on the welcome screen", async () => {
    getSettings.mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: null, userName: null },
    });
    const router = renderApp("/welcome");
    await screen.findByRole("heading", { name: "Welcome to ORBIT" });

    await press("p");

    expect(router.state.location.pathname).toBe("/welcome");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the shortcuts next to the quick actions without changing their names", async () => {
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.keyboard("{Control>}k{/Control}");

    const option = await screen.findByRole("option", { name: "New task" });

    expect(option).toHaveTextContent("Ctrl");
    expect(option).toHaveTextContent("Shift");
    expect(option).toHaveTextContent("T");
  });
});
