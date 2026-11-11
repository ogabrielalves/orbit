import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type FolderEntry, type NoteSummary } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";
import { setVirtualLayout } from "@/test/virtualLayout";

vi.mock("@/pages/notes/editor/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Note body" />,
}));

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const listNotes = vi.mocked(commands.listNotes);
const getNote = vi.mocked(commands.getNote);

const NOTE_COUNT = 1000;
const FOLDER_COUNT = 400;

const notes: NoteSummary[] = Array.from({ length: NOTE_COUNT }, (_, index) => ({
  id: `n${index}`,
  path: `Note ${index}.md`,
  title: `Note ${index}`,
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T10:00:00Z",
}));

const folders: FolderEntry[] = Array.from({ length: FOLDER_COUNT }, (_, index) => ({
  path: `folder-${String(index).padStart(3, "0")}`,
  name: `folder-${String(index).padStart(3, "0")}`,
  noteCount: 1,
}));

function notesList(): HTMLElement {
  return screen.getByRole("list", { name: "Notes" });
}

function foldersList(): HTMLElement {
  return screen.getByRole("list", { name: "Folders" });
}

function scrollerOf(list: HTMLElement): HTMLElement {
  const scroller = list.closest<HTMLElement>("[data-virtual-scroll]");
  if (scroller === null) {
    throw new Error("scroller not found");
  }
  return scroller;
}

function scrollList(list: HTMLElement, offset: number) {
  const scroller = scrollerOf(list);
  scroller.scrollTop = offset;
  act(() => {
    fireEvent.scroll(scroller);
  });
}

describe("long lists in the notes workspace", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    setVirtualLayout({ viewportHeight: 400, itemHeight: 58 });
    Element.prototype.scrollTo = function scrollToElement(
      this: Element,
      options?: ScrollToOptions | number,
    ) {
      const top = typeof options === "number" ? options : (options?.top ?? 0);
      this.scrollTop = top;
      fireEvent.scroll(this);
    };
    for (const command of [getVaultStatus, listFolders, listNotes, getNote]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({ status: "ok", data: [] });
    listNotes.mockResolvedValue({ status: "ok", data: notes });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollTo");
  });

  describe("notes list", () => {
    it("renders a window of the notes, not all of them", async () => {
      renderApp("/notes");

      await screen.findByRole("link", { name: /Note 0/ });

      const rendered = within(notesList()).getAllByRole("listitem");
      expect(rendered.length).toBeLessThan(40);
      expect(rendered[0]).toHaveAttribute("aria-setsize", String(NOTE_COUNT));
      expect(within(notesList()).queryByRole("link", { name: /Note 500/ })).not.toBeInTheDocument();
    });

    it("renders further notes after scrolling", async () => {
      renderApp("/notes");
      await screen.findByRole("link", { name: /Note 0/ });

      scrollList(notesList(), 500 * 64);

      expect(
        await within(notesList()).findByRole("link", { name: /Note 500/ }),
      ).toBeInTheDocument();
      expect(within(notesList()).queryByRole("link", { name: /Note 0/ })).not.toBeInTheDocument();
    });

    it("scrolls the open note into view", async () => {
      getNote.mockResolvedValue({
        status: "ok",
        data: {
          id: "n700",
          path: "Note 700.md",
          title: "Note 700",
          tags: [],
          createdAt: "2026-11-08T10:00:00Z",
          modifiedAt: "2026-11-08T10:00:00Z",
          content: "",
          hash: "h",
        },
      });
      renderApp("/notes/n700");
      await screen.findByRole("list", { name: "Notes" });

      const link = await within(notesList()).findByRole("link", { name: /Note 700/ });

      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("moves between notes with the arrow keys", async () => {
      renderApp("/notes");
      const first = await screen.findByRole("link", { name: /Note 0/ });
      first.focus();

      await userEvent.keyboard("{ArrowDown}");

      expect(await within(notesList()).findByRole("link", { name: /Note 1\b/ })).toHaveFocus();
    });

    it("still offers a drag handle on the rendered notes", async () => {
      renderApp("/notes");

      expect(await screen.findByRole("button", { name: "Move Note 0" })).toBeInTheDocument();
    });
  });

  describe("folder tree", () => {
    beforeEach(() => {
      setVirtualLayout({ viewportHeight: 400, itemHeight: 34 });
      listFolders.mockResolvedValue({ status: "ok", data: folders });
      listNotes.mockResolvedValue({ status: "ok", data: [] });
    });

    it("renders a window of the folders", async () => {
      renderApp("/notes");

      await within(await screen.findByRole("navigation", { name: "Folders" })).findByRole(
        "button",
        {
          name: /^folder-000/,
        },
      );

      const rendered = within(foldersList()).getAllByRole("listitem");
      expect(rendered.length).toBeLessThan(40);
      expect(rendered[0]).toHaveAttribute("aria-setsize", String(FOLDER_COUNT));
    });

    it("keeps the all notes entry outside of the scrolling list", async () => {
      renderApp("/notes");
      const tree = await screen.findByRole("navigation", { name: "Folders" });
      await within(tree).findByRole("button", { name: /^folder-000/ });

      const allNotes = within(tree).getByRole("button", { name: "All notes" });

      expect(foldersList().contains(allNotes)).toBe(false);
    });

    it("renders further folders after scrolling", async () => {
      renderApp("/notes");
      const tree = await screen.findByRole("navigation", { name: "Folders" });
      await within(tree).findByRole("button", { name: /^folder-000/ });

      scrollList(foldersList(), 300 * 36);

      expect(
        await within(foldersList()).findByRole("button", { name: /^folder-300/ }),
      ).toBeInTheDocument();
    });

    it("moves between folders with the arrow keys", async () => {
      renderApp("/notes");
      const tree = await screen.findByRole("navigation", { name: "Folders" });
      const first = await within(tree).findByRole("button", { name: /^folder-000/ });
      first.focus();

      await userEvent.keyboard("{ArrowDown}");

      await waitFor(() =>
        expect(within(foldersList()).getByRole("button", { name: /^folder-001/ })).toHaveFocus(),
      );
    });

    it("selects the folder of the URL and brings it into view", async () => {
      renderApp("/notes?folder=folder-350");
      const tree = await screen.findByRole("navigation", { name: "Folders" });

      const selected = await within(tree).findByRole("button", { name: /^folder-350/ });

      expect(selected).toHaveAttribute("aria-current", "true");
    });
  });
});
