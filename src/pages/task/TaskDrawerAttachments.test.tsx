import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Attachment, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

type DragHandler = (event: { payload: Record<string, unknown> }) => void;

const webview = vi.hoisted(() => ({ handler: null as null | DragHandler }));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: DragHandler) => {
      webview.handler = handler;
      return Promise.resolve(() => undefined);
    },
  }),
}));

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const listAttachments = vi.mocked(commands.listAttachments);
const importAttachment = vi.mocked(commands.importAttachment);
const removeAttachment = vi.mocked(commands.removeAttachment);
const openAttachment = vi.mocked(commands.openAttachment);

const pickFiles = vi.mocked(openDialog);

const task = createTaskFixture({ id: "t1", title: "Write the spec" });

function attachment(id: string, fileName: string, sizeBytes = 2048): Attachment {
  return {
    id,
    taskId: "t1",
    fileName,
    mimeType: "application/pdf",
    sizeBytes,
    createdAt: "2026-11-08T10:00:00Z",
  };
}

async function openDrawer() {
  renderApp("/boards/b1?task=t1");
  await screen.findByRole("textbox", { name: "Title" });
  await waitFor(() => expect(webview.handler).not.toBeNull());
}

async function emit(payload: Record<string, unknown>) {
  await act(async () => {
    webview.handler?.({ payload });
  });
}

describe("TaskDrawer attachments", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    webview.handler = null;
    for (const command of [
      getBoard,
      listBoardTasks,
      getTask,
      listAttachments,
      importAttachment,
      removeAttachment,
      openAttachment,
    ]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    getTask.mockResolvedValue({ status: "ok", data: task });
    listAttachments.mockResolvedValue({ status: "ok", data: [] });
  });

  describe("listing", () => {
    it("shows the hint to drop files when there are none", async () => {
      await openDrawer();

      expect(await screen.findByText("Drop files here to attach them")).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Attached files" })).not.toBeInTheDocument();
      expect(listAttachments).toHaveBeenCalledWith("t1");
    });

    it("lists the files with their size", async () => {
      listAttachments.mockResolvedValue({
        status: "ok",
        data: [attachment("f1", "spec.pdf", 1536), attachment("f2", "logo.png", 5 * 1024 * 1024)],
      });
      await openDrawer();

      const list = await screen.findByRole("list", { name: "Attached files" });
      const items = within(list).getAllByRole("listitem");

      expect(items[0]).toHaveTextContent("spec.pdf");
      expect(items[0]).toHaveTextContent("1.5 KB");
      expect(items[1]).toHaveTextContent("logo.png");
      expect(items[1]).toHaveTextContent("5 MB");
    });
  });

  describe("opening and removing", () => {
    beforeEach(() => {
      listAttachments.mockResolvedValue({ status: "ok", data: [attachment("f1", "spec.pdf")] });
    });

    it("opens a file with the system", async () => {
      openAttachment.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Open spec.pdf" }));

      expect(openAttachment).toHaveBeenCalledWith("f1");
    });

    it("shows the translated error when the file cannot be opened", async () => {
      openAttachment.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Open spec.pdf" }));

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
    });

    it("asks before removing and then removes", async () => {
      removeAttachment.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Remove spec.pdf" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Remove “spec.pdf”?" });
      expect(removeAttachment).not.toHaveBeenCalled();
      await userEvent.click(within(confirm).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(removeAttachment).toHaveBeenCalledWith("f1"));
      expect(await screen.findByText("Attachment removed")).toBeInTheDocument();
    });

    it("keeps the file when the removal is cancelled", async () => {
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Remove spec.pdf" }));

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(removeAttachment).not.toHaveBeenCalled();
      expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    });
  });

  describe("attach button", () => {
    it("imports the files picked in the system dialog", async () => {
      pickFiles.mockResolvedValueOnce(["C:\\a.pdf", "C:\\b.png"]);
      importAttachment.mockResolvedValue({ status: "ok", data: attachment("f9", "a.pdf") });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Attach" }));

      await waitFor(() => expect(importAttachment).toHaveBeenCalledTimes(2));
      expect(importAttachment).toHaveBeenNthCalledWith(1, "t1", "C:\\a.pdf");
      expect(await screen.findByText("2 files attached")).toBeInTheDocument();
    });

    it("does nothing when the dialog is cancelled", async () => {
      pickFiles.mockResolvedValueOnce(null);
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Attach" }));

      expect(pickFiles).toHaveBeenCalled();
      expect(importAttachment).not.toHaveBeenCalled();
    });
  });

  describe("dropping files", () => {
    it("highlights the zone while files are over the window", async () => {
      await openDrawer();

      await emit({ type: "enter", paths: ["a"], position: { x: 0, y: 0 } });
      expect(await screen.findByText("Release to attach")).toBeInTheDocument();
      await emit({ type: "leave" });

      expect(screen.getByText("Drop files here to attach them")).toBeInTheDocument();
    });

    it("imports every dropped file into the open task and confirms", async () => {
      importAttachment.mockResolvedValue({ status: "ok", data: attachment("f9", "a.pdf") });
      await openDrawer();

      await emit({ type: "drop", paths: ["C:\\a.pdf", "C:\\b.png"], position: { x: 0, y: 0 } });

      await waitFor(() => expect(importAttachment).toHaveBeenCalledTimes(2));
      expect(importAttachment).toHaveBeenNthCalledWith(1, "t1", "C:\\a.pdf");
      expect(importAttachment).toHaveBeenNthCalledWith(2, "t1", "C:\\b.png");
      expect(await screen.findByText("2 files attached")).toBeInTheDocument();
    });

    it("says one file in the singular", async () => {
      importAttachment.mockResolvedValue({ status: "ok", data: attachment("f9", "a.pdf") });
      await openDrawer();

      await emit({ type: "drop", paths: ["C:\\a.pdf"], position: { x: 0, y: 0 } });

      expect(await screen.findByText("1 file attached")).toBeInTheDocument();
    });

    it("keeps going when one file is refused and only counts the ones that worked", async () => {
      importAttachment
        .mockResolvedValueOnce({
          status: "error",
          error: { code: "VALIDATION", message: "too large" },
        })
        .mockResolvedValueOnce({ status: "ok", data: attachment("f9", "b.png") });
      await openDrawer();

      await emit({ type: "drop", paths: ["C:\\huge.iso", "C:\\b.png"], position: { x: 0, y: 0 } });

      expect(await screen.findByText("1 file attached")).toBeInTheDocument();
      expect(importAttachment).toHaveBeenCalledTimes(2);
      expect(await screen.findByText("The information provided is not valid.")).toBeInTheDocument();
    });

    it("shows no success message when every file is refused", async () => {
      importAttachment.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "too large" },
      });
      await openDrawer();

      await emit({ type: "drop", paths: ["C:\\huge.iso"], position: { x: 0, y: 0 } });

      await screen.findByText("The information provided is not valid.");
      expect(screen.queryByText(/attached/)).not.toBeInTheDocument();
    });

    it("speaks Portuguese", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
      });
      renderApp("/boards/b1?task=t1");

      expect(await screen.findByText("Solte arquivos aqui para anexá-los")).toBeInTheDocument();
    });
  });
});
