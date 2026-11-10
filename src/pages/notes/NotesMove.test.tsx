import type { DndContextProps } from "@dnd-kit/core";
import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type FolderEntry, type NoteSummary } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const dnd = vi.hoisted(() => ({ props: null as DndContextProps | null }));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(actual.DndContext, props);
    },
  };
});

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const listNotes = vi.mocked(commands.listNotes);
const moveNote = vi.mocked(commands.moveNote);
const moveFolder = vi.mocked(commands.moveFolder);

function folder(path: string, noteCount = 0): FolderEntry {
  return { path, name: path.split("/").pop() ?? path, noteCount };
}

function note(id: string, title: string, path: string): NoteSummary {
  return {
    id,
    path,
    title,
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
  };
}

type DragEnd = Parameters<NonNullable<DndContextProps["onDragEnd"]>>[0];

function dragNote(target: { path: string; name: string } | null) {
  return {
    active: {
      id: "note-drag:n1",
      data: { current: { kind: "note", id: "n1", name: "Ideas", folderPath: "work" } },
    },
    over: target === null ? null : { id: `folder-drop:${target.path}`, data: { current: target } },
  } as unknown as DragEnd;
}

function dragFolder(path: string, target: { path: string; name: string }) {
  return {
    active: {
      id: `folder-drag:${path}`,
      data: { current: { kind: "folder", path, name: path.split("/").pop() } },
    },
    over: { id: `folder-drop:${target.path}`, data: { current: target } },
  } as unknown as DragEnd;
}

async function drop(event: DragEnd) {
  await act(async () => {
    dnd.props?.onDragEnd?.(event);
  });
}

describe("Notes drag and drop", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.props = null;
    for (const command of [listFolders, listNotes, moveNote, moveFolder]) {
      command.mockReset();
    }
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({
      status: "ok",
      data: [folder("work", 1), folder("work/plans", 2), folder("home", 0)],
    });
    listNotes.mockResolvedValue({
      status: "ok",
      data: [note("n1", "Ideas", "work/Ideas.md")],
    });
  });

  it("offers a drag handle for each folder and note without changing the note link", async () => {
    renderApp("/notes");

    expect(await screen.findByRole("button", { name: "Move Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ideas/ })).toBeInTheDocument();
  });

  it("describes the keyboard interaction to screen readers", async () => {
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    expect(dnd.props?.accessibility?.screenReaderInstructions?.draggable).toContain("press space");
  });

  it("moves a note dropped on another folder", async () => {
    moveNote.mockResolvedValue({ status: "ok", data: note("n1", "Ideas", "home/Ideas.md") });
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    await drop(dragNote({ path: "home", name: "home" }));

    expect(moveNote).toHaveBeenCalledWith("n1", "home");
  });

  it("moves a note dropped on All notes to the vault root", async () => {
    moveNote.mockResolvedValue({ status: "ok", data: note("n1", "Ideas", "Ideas.md") });
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    await drop(dragNote({ path: "", name: "Vault root" }));

    expect(moveNote).toHaveBeenCalledWith("n1", null);
  });

  it("does nothing when a note is dropped in its own folder or outside any target", async () => {
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    await drop(dragNote({ path: "work", name: "work" }));
    await drop(dragNote(null));

    expect(moveNote).not.toHaveBeenCalled();
  });

  it("moves a folder under another folder", async () => {
    moveFolder.mockResolvedValue({ status: "ok", data: folder("home/work") });
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    await drop(dragFolder("work", { path: "home", name: "home" }));

    expect(moveFolder).toHaveBeenCalledWith("work", "home");
  });

  it("refuses to move a folder into itself or its descendants", async () => {
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });

    await drop(dragFolder("work", { path: "work/plans", name: "plans" }));
    await drop(dragFolder("work", { path: "work", name: "work" }));

    expect(moveFolder).not.toHaveBeenCalled();
  });

  it("keeps the selected folder pointing at the same place after it is moved", async () => {
    moveFolder.mockResolvedValue({ status: "ok", data: folder("home/work") });
    const router = renderApp("/notes?folder=work%2Fplans");
    await screen.findByRole("button", { name: "Move work" });

    await drop(dragFolder("work", { path: "home", name: "home" }));

    await vi.waitFor(() =>
      expect(router.state.location.search).toMatchObject({ folder: "home/work/plans" }),
    );
  });

  it("announces the drag for screen readers", async () => {
    renderApp("/notes");
    await screen.findByRole("button", { name: "Move Ideas" });
    const announcements = dnd.props?.accessibility?.announcements;
    const active = dragNote(null).active;
    const over = dragNote({ path: "home", name: "home" }).over;

    expect(announcements?.onDragStart?.({ active } as never)).toBe("Ideas picked up.");
    expect(announcements?.onDragOver?.({ active, over } as never)).toBe("Ideas over home.");
    expect(announcements?.onDragEnd?.({ active, over } as never)).toBe("Ideas moved to home.");
    expect(announcements?.onDragEnd?.({ active, over: null } as never)).toContain("cancelled");
  });
});
