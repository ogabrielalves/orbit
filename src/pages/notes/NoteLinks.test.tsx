import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type NoteDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ onNavigateLink }: { onNavigateLink?: (target: string) => void }) => (
    <button type="button" onClick={() => onNavigateLink?.("Plans")}>
      Follow link
    </button>
  ),
}));

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);
const createNote = vi.mocked(commands.createNote);
const getNoteLinks = vi.mocked(commands.getNoteLinks);
const resolveNoteLink = vi.mocked(commands.resolveNoteLink);

function details(id: string, title: string): NoteDetails {
  return {
    id,
    path: `${title}.md`,
    title,
    tags: [],
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
    content: `# ${title}`,
    hash: "h1",
  };
}

describe("note links", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [listNotes, getNote, createNote, getNoteLinks, resolveNoteLink]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    const ideas = details("n1", "Ideas");
    const plans = details("n2", "Plans");
    listNotes.mockResolvedValue({ status: "ok", data: [ideas, plans] });
    getNote.mockImplementation(async (id) => ({ status: "ok", data: id === "n1" ? ideas : plans }));
    getNoteLinks.mockResolvedValue({ status: "ok", data: { outgoing: [], backlinks: [] } });
    resolveNoteLink.mockResolvedValue({ status: "ok", data: null });
  });

  it("lists backlinks and outgoing links of the open note", async () => {
    const plans = details("n2", "Plans");
    getNoteLinks.mockResolvedValue({
      status: "ok",
      data: {
        backlinks: [{ note: plans, linkCount: 2 }],
        outgoing: [
          { targetTitle: "Plans", linkCount: 1, resolved: plans },
          { targetTitle: "Missing", linkCount: 1, resolved: null },
        ],
      },
    });
    renderApp("/notes/n1");

    const panel = await screen.findByRole("region", { name: "Connections" });

    expect(await within(panel).findByRole("link", { name: /Plans\s*2 links/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/notes/n2"),
    );
    expect(within(panel).getByRole("link", { name: /Plans\s*1 link$/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Missing/ })).toBeInTheDocument();
    expect(getNoteLinks).toHaveBeenCalledWith("n1");
  });

  it("shows empty messages when the note has no links", async () => {
    renderApp("/notes/n1");

    expect(await screen.findByText("No note points to this one.")).toBeInTheDocument();
    expect(screen.getByText("This note does not point to others.")).toBeInTheDocument();
  });

  it("opens the note a link resolves to", async () => {
    resolveNoteLink.mockResolvedValue({ status: "ok", data: details("n2", "Plans") });
    renderApp("/notes/n1");

    await userEvent.click(await screen.findByRole("button", { name: "Follow link" }));

    expect(resolveNoteLink).toHaveBeenCalledWith("Plans");
    expect(await screen.findByRole("article", { name: "Plans" })).toBeInTheDocument();
  });

  it("offers to create the note when a link has no match and opens it after creating", async () => {
    createNote.mockResolvedValue({ status: "ok", data: details("n3", "Plans") });
    getNote.mockImplementation(async (id) => ({
      status: "ok",
      data: details(id, id === "n3" ? "Plans" : "Ideas"),
    }));
    renderApp("/notes/n1");

    await userEvent.click(await screen.findByRole("button", { name: "Follow link" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Create “Plans”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create note" }));

    expect(createNote).toHaveBeenCalledWith({ title: "Plans", folderPath: null });
    expect(await screen.findByRole("article", { name: "Plans" })).toBeInTheDocument();
  });

  it("does not create anything when the offer is dismissed", async () => {
    renderApp("/notes/n1");

    await userEvent.click(await screen.findByRole("button", { name: "Follow link" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(createNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("offers to create a note from an unresolved outgoing link", async () => {
    getNoteLinks.mockResolvedValue({
      status: "ok",
      data: { backlinks: [], outgoing: [{ targetTitle: "Missing", linkCount: 1, resolved: null }] },
    });
    renderApp("/notes/n1");

    await userEvent.click(await screen.findByRole("button", { name: /Missing/ }));

    expect(
      await screen.findByRole("alertdialog", { name: "Create “Missing”?" }),
    ).toBeInTheDocument();
  });
});
