import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type FolderEntry, type NoteSummary } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const createFolder = vi.mocked(commands.createFolder);
const renameFolder = vi.mocked(commands.renameFolder);
const deleteFolder = vi.mocked(commands.deleteFolder);
const listNotes = vi.mocked(commands.listNotes);
const createNote = vi.mocked(commands.createNote);
const getNote = vi.mocked(commands.getNote);

function folder(path: string, noteCount = 0): FolderEntry {
  return { path, name: path.split("/").pop() ?? path, noteCount };
}

function note(id: string, title: string, path = `${title}.md`): NoteSummary {
  return {
    id,
    path,
    title,
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
  };
}

const folders = [folder("work", 1), folder("work/plans", 2), folder("empty", 0)];

async function openMenu(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
}

describe("Notes workspace", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      listFolders,
      createFolder,
      renameFolder,
      deleteFolder,
      listNotes,
      createNote,
      getNote,
    ]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({ status: "ok", data: folders });
    listNotes.mockResolvedValue({ status: "ok", data: [note("n1", "Ideas")] });
  });

  describe("layout", () => {
    it("shows the folder tree and the notes of the whole vault", async () => {
      renderApp("/notes");

      const tree = await screen.findByRole("navigation", { name: "Folders" });
      expect(within(tree).getByRole("button", { name: "All notes" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      expect(within(tree).getByRole("button", { name: /^work/ })).toBeInTheDocument();
      expect(within(tree).getByRole("button", { name: /^empty/ })).toBeInTheDocument();
      expect(within(tree).queryByRole("button", { name: /^plans/ })).not.toBeInTheDocument();
      expect(await screen.findByRole("link", { name: /Ideas/ })).toBeInTheDocument();
      expect(listNotes).toHaveBeenCalledWith({});
      expect(screen.getByText("Select a note")).toBeInTheDocument();
    });

    it("expands and collapses a folder", async () => {
      renderApp("/notes");

      await userEvent.click(await screen.findByRole("button", { name: "Expand work" }));
      expect(await screen.findByRole("button", { name: /^plans/ })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Collapse work" }));

      expect(screen.queryByRole("button", { name: /^plans/ })).not.toBeInTheDocument();
    });

    it("lists only the notes of the selected folder", async () => {
      renderApp("/notes");
      await userEvent.click(await screen.findByRole("button", { name: /^work/ }));

      await waitFor(() =>
        expect(listNotes).toHaveBeenLastCalledWith({
          folderPath: "work",
          includeSubfolders: false,
        }),
      );
      expect(screen.getByRole("heading", { name: "work" })).toBeInTheDocument();
    });

    it("expands the ancestors of a folder opened from the URL", async () => {
      renderApp("/notes?folder=work%2Fplans");

      const plans = await screen.findByRole("button", { name: /^plans/ });

      expect(plans).toHaveAttribute("aria-current", "true");
    });

    it("shows the empty state when the folder has no notes", async () => {
      listNotes.mockResolvedValue({ status: "ok", data: [] });
      renderApp("/notes");

      expect(await screen.findByText("No notes here yet")).toBeInTheDocument();
    });

    it("shows the translated error with a retry", async () => {
      listNotes.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      renderApp("/notes");

      expect(await screen.findByText("Could not load the notes")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("link", { name: /Ideas/ })).toBeInTheDocument();
    });

    it("opens a note from the list", async () => {
      getNote.mockResolvedValue({
        status: "ok",
        data: {
          ...note("n1", "Ideas"),
          tags: [],
          content: "# Ideas",
          hash: "h1",
        },
      });
      renderApp("/notes");

      await userEvent.click(await screen.findByRole("link", { name: /Ideas/ }));

      expect(await screen.findByRole("article", { name: "Ideas" })).toBeInTheDocument();
      expect(getNote).toHaveBeenCalledWith("n1");
    });
  });

  describe("creating", () => {
    it("creates a folder at the root and selects it", async () => {
      createFolder.mockResolvedValue({ status: "ok", data: folder("inbox") });
      renderApp("/notes");

      await userEvent.click(await screen.findByRole("button", { name: "New folder" }));
      const dialog = await screen.findByRole("dialog", { name: "New folder" });
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Folder name" }), "inbox");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(createFolder).toHaveBeenCalledWith({ parentPath: null, name: "inbox" }),
      );
      expect(await screen.findByText("Folder created")).toBeInTheDocument();
    });

    it("creates a subfolder from the folder menu", async () => {
      createFolder.mockResolvedValue({ status: "ok", data: folder("work/sub") });
      renderApp("/notes");

      await openMenu("work");
      await userEvent.click(await screen.findByRole("menuitem", { name: "New subfolder" }));
      const dialog = await screen.findByRole("dialog", { name: "New folder" });
      await userEvent.type(within(dialog).getByRole("textbox"), "sub");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(createFolder).toHaveBeenCalledWith({ parentPath: "work", name: "sub" }),
      );
    });

    it("creates a note in the selected folder and opens it", async () => {
      createNote.mockResolvedValue({
        status: "ok",
        data: { ...note("n9", "Weekly"), tags: [], content: "# Weekly", hash: "h" },
      });
      getNote.mockResolvedValue({
        status: "ok",
        data: { ...note("n9", "Weekly"), tags: [], content: "# Weekly", hash: "h" },
      });
      renderApp("/notes?folder=work");

      await userEvent.click(await screen.findByRole("button", { name: "New note" }));
      const dialog = await screen.findByRole("dialog", { name: "New note" });
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Title" }), "Weekly");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(createNote).toHaveBeenCalledWith({ title: "Weekly", folderPath: "work" }),
      );
      expect(await screen.findByRole("article", { name: "Weekly" })).toBeInTheDocument();
    });

    it("creates a note at the vault root from All notes", async () => {
      createNote.mockResolvedValue({
        status: "ok",
        data: { ...note("n9", "Root"), tags: [], content: "", hash: "h" },
      });
      getNote.mockResolvedValue({
        status: "ok",
        data: { ...note("n9", "Root"), tags: [], content: "", hash: "h" },
      });
      renderApp("/notes");

      await userEvent.click(await screen.findByRole("button", { name: "New note" }));
      const dialog = await screen.findByRole("dialog", { name: "New note" });
      await userEvent.type(within(dialog).getByRole("textbox"), "Root");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(createNote).toHaveBeenCalledWith({ title: "Root", folderPath: null }),
      );
    });
  });

  describe("renaming", () => {
    it("renames a folder from the menu", async () => {
      renameFolder.mockResolvedValue({ status: "ok", data: folder("job") });
      renderApp("/notes");

      await openMenu("empty");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename folder" });
      const input = within(dialog).getByRole("textbox", { name: "Folder name" });
      expect(input).toHaveValue("empty");
      await userEvent.clear(input);
      await userEvent.type(input, "job");
      await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

      await waitFor(() => expect(renameFolder).toHaveBeenCalledWith("empty", "job"));
      expect(await screen.findByText("Folder renamed")).toBeInTheDocument();
    });

    it("follows the folder when the selected one is renamed", async () => {
      renameFolder.mockResolvedValue({ status: "ok", data: folder("job", 1) });
      renderApp("/notes?folder=work");

      await openMenu("work");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename folder" });
      const input = within(dialog).getByRole("textbox", { name: "Folder name" });
      await userEvent.clear(input);
      await userEvent.type(input, "job");
      await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

      await waitFor(() =>
        expect(listNotes).toHaveBeenLastCalledWith({
          folderPath: "job",
          includeSubfolders: false,
        }),
      );
    });
  });

  describe("deleting", () => {
    it("asks before deleting an empty folder and does not use recursion", async () => {
      deleteFolder.mockResolvedValue({ status: "ok", data: null });
      renderApp("/notes");

      await openMenu("empty");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Delete the folder “empty”?" });
      expect(deleteFolder).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("empty", false));
      expect(await screen.findByText("Folder deleted")).toBeInTheDocument();
    });

    it("requires typing the name before deleting a folder with content recursively", async () => {
      deleteFolder.mockResolvedValue({ status: "ok", data: null });
      renderApp("/notes");

      await openMenu("work");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Permanently delete “work” and everything inside it?",
      });
      expect(dialog).toHaveTextContent("This removes 3 notes");
      expect(dialog).toHaveTextContent("does not go to a trash");
      const confirm = within(dialog).getByRole("button", { name: "Delete permanently" });
      expect(confirm).toBeDisabled();
      await userEvent.type(within(dialog).getByRole("textbox"), "work");
      await userEvent.click(confirm);

      await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("work", true));
    });

    it("keeps the folder when the deletion is cancelled", async () => {
      renderApp("/notes");

      await openMenu("work");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(deleteFolder).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /^work/ })).toBeInTheDocument();
    });

    it("goes back to all notes when the selected folder is deleted", async () => {
      deleteFolder.mockResolvedValue({ status: "ok", data: null });
      renderApp("/notes?folder=empty");

      await openMenu("empty");
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "All notes" })).toHaveAttribute(
          "aria-current",
          "true",
        ),
      );
    });
  });

  describe("context menu", () => {
    it("opens the folder menu with a right click", async () => {
      renderApp("/notes");

      fireEvent.contextMenu(await screen.findByRole("button", { name: /^work/ }));

      expect(await screen.findByRole("menuitem", { name: "New note here" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    });
  });
});
