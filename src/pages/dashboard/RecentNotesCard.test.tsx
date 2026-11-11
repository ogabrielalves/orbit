import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type RecentNote } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const listRecentNotes = vi.mocked(commands.listRecentNotes);
const getNote = vi.mocked(commands.getNote);

function createNote(overrides: Partial<RecentNote> = {}): RecentNote {
  return {
    id: "n1",
    title: "Meeting notes",
    path: "Meeting notes.md",
    folder: null,
    excerpt: "Agenda and decisions",
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T12:00:00Z",
    ...overrides,
  };
}

async function findCard(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name: "Recent notes" });
  return heading.closest("section") as HTMLElement;
}

describe("recent notes card", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    listRecentNotes.mockReset();
    getNote.mockReset();
    listRecentNotes.mockResolvedValue({ status: "ok", data: [] });
    getNote.mockReturnValue(new Promise(() => undefined));
  });

  it("shows a loading state while the notes load", async () => {
    listRecentNotes.mockReturnValue(new Promise(() => undefined));
    renderApp("/");

    const card = await findCard();

    expect(within(card).getByRole("status")).toHaveTextContent("Loading…");
  });

  it("asks for the five most recent notes", async () => {
    renderApp("/");

    await findCard();

    expect(listRecentNotes).toHaveBeenCalledWith({ limit: 5 });
  });

  it("shows an empty state when there are no notes", async () => {
    renderApp("/");

    const card = await findCard();

    expect(await within(card).findByText("No notes yet")).toBeInTheDocument();
    expect(within(card).getByText("The notes you create will appear here.")).toBeInTheDocument();
    expect(within(card).queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists the notes in the order received with title and excerpt", async () => {
    listRecentNotes.mockResolvedValue({
      status: "ok",
      data: [
        createNote(),
        createNote({ id: "n2", title: "Ideas", excerpt: "Things to try", path: "Ideas.md" }),
      ],
    });
    renderApp("/");

    const card = await findCard();
    const items = await within(card).findAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Meeting notes");
    expect(items[0]).toHaveTextContent("Agenda and decisions");
    expect(items[1]).toHaveTextContent("Ideas");
    expect(items[1]).toHaveTextContent("Things to try");
  });

  it("omits the excerpt line for an empty note", async () => {
    listRecentNotes.mockResolvedValue({ status: "ok", data: [createNote({ excerpt: "  " })] });
    renderApp("/");

    const card = await findCard();
    const item = await within(card).findByRole("listitem");

    expect(item).toHaveTextContent("Meeting notes");
    expect(item.querySelectorAll("span.truncate")).toHaveLength(1);
  });

  it("opens the note when it is clicked", async () => {
    listRecentNotes.mockResolvedValue({ status: "ok", data: [createNote({ id: "n7" })] });
    const router = renderApp("/");
    const card = await findCard();

    await userEvent.click(await within(card).findByRole("link", { name: /Meeting notes/ }));

    expect(router.state.location.pathname).toBe("/notes/n7");
  });

  it("links to all the notes", async () => {
    const router = renderApp("/");
    const card = await findCard();

    await userEvent.click(within(card).getByRole("link", { name: "All" }));

    expect(router.state.location.pathname).toBe("/notes");
  });

  it("explains the failure and loads the notes on retry", async () => {
    listRecentNotes.mockResolvedValue({ status: "error", error: { code: "IO", message: "x" } });
    renderApp("/");
    const card = await findCard();

    expect(await within(card).findByText("Could not load the notes")).toBeInTheDocument();
    expect(
      within(card).getByText("Could not access the files. Check the folder permissions."),
    ).toBeInTheDocument();

    listRecentNotes.mockResolvedValue({ status: "ok", data: [createNote()] });
    await userEvent.click(within(card).getByRole("button", { name: "Try again" }));

    expect(await within(card).findByText("Meeting notes")).toBeInTheDocument();
    expect(within(card).queryByText("Could not load the notes")).not.toBeInTheDocument();
  });

  it("is translated to pt-BR", async () => {
    await i18next.changeLanguage("pt-BR");
    const settings = vi.mocked(commands.getSettings);
    settings.mockResolvedValue({
      status: "ok",
      data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
    });
    renderApp("/");

    const heading = await screen.findByRole("heading", { level: 2, name: "Notas recentes" });
    const card = heading.closest("section") as HTMLElement;

    expect(await within(card).findByText("Nenhuma nota ainda")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Todas" })).toBeInTheDocument();
  });
});
