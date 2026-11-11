import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Graph, type GraphNode, type NoteDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Note body" />,
}));

const getLocalGraph = vi.mocked(commands.getLocalGraph);
const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);

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

function node(id: string, title: string, distance: number): GraphNode {
  return { id, kind: "note", title, path: `${title}.md`, degree: 1, distance };
}

const graph: Graph = {
  nodes: [node("n1", "Ideas", 0), node("n2", "Plans", 1), node("n3", "Roadmap", 1)],
  edges: [
    { source: "n1", target: "n2", weight: 1 },
    { source: "n1", target: "n3", weight: 1 },
  ],
};

async function findPanel() {
  return screen.findByRole("region", { name: "Local graph" });
}

describe("LocalGraphPanel", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [getLocalGraph, getVaultStatus, listNotes, getNote]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listNotes.mockResolvedValue({ status: "ok", data: [note] });
    getNote.mockResolvedValue({ status: "ok", data: note });
    getLocalGraph.mockResolvedValue({ status: "ok", data: graph });
  });

  it("asks for the graph around the open note with depth 1", async () => {
    renderApp("/notes/n1");

    await findPanel();

    await waitFor(() =>
      expect(getLocalGraph).toHaveBeenCalledWith({
        noteId: "n1",
        depth: 1,
        includeUnresolved: false,
      }),
    );
  });

  it("links the neighbors and marks the open note", async () => {
    renderApp("/notes/n1");
    const panel = within(await findPanel());

    expect(await panel.findByRole("link", { name: "Plans" })).toHaveAttribute("href", "/notes/n2");
    expect(panel.getByRole("link", { name: "Roadmap" })).toHaveAttribute("href", "/notes/n3");
    expect(panel.queryByRole("link", { name: "Ideas" })).not.toBeInTheDocument();
    expect(panel.getByText("Ideas (current note)")).toBeInTheDocument();
  });

  it("opens a neighbor note when it is clicked", async () => {
    const router = renderApp("/notes/n1");
    const panel = within(await findPanel());

    await userEvent.click(await panel.findByRole("link", { name: "Plans" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/notes/n2"));
  });

  it("keeps the selected folder when opening a neighbor", async () => {
    const router = renderApp("/notes/n1?folder=work");
    const panel = within(await findPanel());

    await userEvent.click(await panel.findByRole("link", { name: "Plans" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/notes/n2"));
    expect(router.state.location.search).toMatchObject({ folder: "work" });
  });

  it("reloads with the chosen depth", async () => {
    renderApp("/notes/n1");
    const panel = within(await findPanel());
    await panel.findByRole("link", { name: "Plans" });

    await userEvent.click(panel.getByRole("radio", { name: "2 levels" }));

    await waitFor(() =>
      expect(getLocalGraph).toHaveBeenLastCalledWith({
        noteId: "n1",
        depth: 2,
        includeUnresolved: false,
      }),
    );
  });

  it("says so when the note is not connected to anything", async () => {
    getLocalGraph.mockResolvedValue({
      status: "ok",
      data: { nodes: [node("n1", "Ideas", 0)], edges: [] },
    });
    renderApp("/notes/n1");
    const panel = within(await findPanel());

    expect(
      await panel.findByText("This note is not connected to other notes yet."),
    ).toBeInTheDocument();
    expect(panel.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    getLocalGraph.mockResolvedValueOnce({
      status: "error",
      error: { code: "DATABASE", message: "x" },
    });
    renderApp("/notes/n1");
    const panel = within(await findPanel());

    expect(await panel.findByText("Could not load the local graph")).toBeInTheDocument();
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));

    expect(await panel.findByRole("link", { name: "Plans" })).toBeInTheDocument();
  });
});
