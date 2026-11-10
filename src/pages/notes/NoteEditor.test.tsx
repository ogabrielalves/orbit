import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type NoteDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: ({
    initialValue,
    onChange,
  }: {
    initialValue: string;
    onChange: (markdown: string) => void;
  }) => (
    <textarea
      aria-label="Note body"
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);
const saveNote = vi.mocked(commands.saveNote);
const renameNote = vi.mocked(commands.renameNote);
const deleteNote = vi.mocked(commands.deleteNote);

function details(id: string, title: string, content = `# ${title}`, hash = "h1"): NoteDetails {
  return {
    id,
    path: `${title}.md`,
    title,
    tags: [],
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
    content,
    hash,
  };
}

const waitOptions = { timeout: 4000 };

async function typeInBody(text: string) {
  const body = await screen.findByRole("textbox", { name: "Note body" });
  await userEvent.type(body, text);
}

describe("NoteEditor", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [listNotes, getNote, saveNote, renameNote, deleteNote]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    const first = details("n1", "Ideas");
    const second = details("n2", "Plans");
    listNotes.mockResolvedValue({ status: "ok", data: [first, second] });
    getNote.mockImplementation(async (id) => ({
      status: "ok",
      data: id === "n1" ? first : second,
    }));
  });

  it("shows the note content and starts as saved", async () => {
    renderApp("/notes/n1");

    expect(await screen.findByRole("textbox", { name: "Note body" })).toHaveValue("# Ideas");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("saves automatically after typing and shows the status", async () => {
    saveNote.mockResolvedValue({ status: "ok", data: details("n1", "Ideas", "# Ideas!", "h2") });
    renderApp("/notes/n1");

    await typeInBody("!");

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(
      () =>
        expect(saveNote).toHaveBeenCalledWith("n1", {
          content: "# Ideas!",
          baseHash: "h1",
          force: false,
        }),
      waitOptions,
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows the error and retries from the indicator", async () => {
    saveNote
      .mockResolvedValueOnce({ status: "error", error: { code: "IO", message: "disk" } })
      .mockResolvedValueOnce({ status: "ok", data: details("n1", "Ideas", "# Ideas!", "h2") });
    renderApp("/notes/n1");

    await typeInBody("!");
    expect(await screen.findByText("Could not save", undefined, waitOptions)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(saveNote).toHaveBeenCalledTimes(2);
  });

  describe("conflict", () => {
    beforeEach(() => {
      saveNote.mockResolvedValueOnce({
        status: "error",
        error: { code: "CONFLICT", message: "changed" },
      });
    });

    it("asks what to do and overwrites with force when the user keeps their version", async () => {
      saveNote.mockResolvedValueOnce({
        status: "ok",
        data: details("n1", "Ideas", "# Ideas!", "h9"),
      });
      renderApp("/notes/n1");

      await typeInBody("!");
      const dialog = await screen.findByRole(
        "alertdialog",
        { name: "This note changed outside ORBIT" },
        waitOptions,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Keep my version" }));

      await waitFor(() =>
        expect(saveNote).toHaveBeenLastCalledWith("n1", {
          content: "# Ideas!",
          baseHash: "h1",
          force: true,
        }),
      );
      expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("loads the file version when the user chooses to reload", async () => {
      renderApp("/notes/n1");
      await typeInBody("!");
      const dialog = await screen.findByRole("alertdialog", undefined, waitOptions);
      getNote.mockResolvedValue({
        status: "ok",
        data: details("n1", "Ideas", "# Ideas from disk", "h5"),
      });

      await userEvent.click(within(dialog).getByRole("button", { name: "Load the file version" }));

      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Note body" })).toHaveValue("# Ideas from disk"),
      );
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    it("lets the user decide later and resolve from the indicator", async () => {
      renderApp("/notes/n1");
      await typeInBody("!");
      const dialog = await screen.findByRole("alertdialog", undefined, waitOptions);

      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Resolve" }));

      expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("leaving with unsaved changes", () => {
    beforeEach(() => {
      saveNote.mockResolvedValue({ status: "error", error: { code: "IO", message: "disk" } });
    });

    async function failToSave() {
      renderApp("/notes/n1");
      await typeInBody("!");
      await screen.findByText("Could not save", undefined, waitOptions);
    }

    it("blocks the navigation and lets the user keep editing", async () => {
      await failToSave();

      await userEvent.click(screen.getByRole("link", { name: /Plans/ }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Your changes were not saved",
      });
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Note body" })).toHaveValue("# Ideas!");
    });

    it("leaves without saving when the user insists", async () => {
      await failToSave();
      saveNote.mockClear();

      await userEvent.click(screen.getByRole("link", { name: /Plans/ }));
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Leave without saving" }));

      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Note body" })).toHaveValue("# Plans"),
      );
      expect(saveNote).not.toHaveBeenCalled();
    });

    it("leaves after a successful retry from the dialog", async () => {
      await failToSave();
      saveNote.mockResolvedValue({
        status: "ok",
        data: details("n1", "Ideas", "# Ideas!", "h2"),
      });

      await userEvent.click(screen.getByRole("link", { name: /Plans/ }));
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Try saving again" }));

      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Note body" })).toHaveValue("# Plans"),
      );
    });
  });

  describe("note actions", () => {
    async function openMenu() {
      await userEvent.click(await screen.findByRole("button", { name: "Note actions" }));
    }

    it("renames the note", async () => {
      renameNote.mockResolvedValue({
        status: "ok",
        data: { note: details("n1", "Thoughts"), rewrittenNotes: 2 },
      });
      renderApp("/notes/n1");

      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename note" });
      const input = within(dialog).getByRole("textbox", { name: "Title" });
      await userEvent.clear(input);
      await userEvent.type(input, "Thoughts");
      await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

      await waitFor(() => expect(renameNote).toHaveBeenCalledWith("n1", "Thoughts"));
      expect(await screen.findByText("Note renamed · 2 links updated")).toBeInTheDocument();
    });

    it("asks before deleting and goes back to the list", async () => {
      deleteNote.mockResolvedValue({ status: "ok", data: null });
      renderApp("/notes/n1");

      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Delete “Ideas”?" });
      expect(deleteNote).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteNote).toHaveBeenCalledWith("n1"));
      expect(await screen.findByText("Select a note")).toBeInTheDocument();
    });
  });
});
