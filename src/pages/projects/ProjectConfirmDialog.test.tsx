import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import {
  ProjectConfirmDialog,
  type ProjectConfirmKind,
} from "@/pages/projects/ProjectConfirmDialog";
import { createProjectFixture } from "@/test/projectFixture";
import { renderWithRouter } from "@/test/renderWithRouter";

const archiveProject = vi.mocked(commands.archiveProject);
const restoreProject = vi.mocked(commands.restoreProject);
const deleteProject = vi.mocked(commands.deleteProject);

function renderDialog(kind: ProjectConfirmKind, project = createProjectFixture()) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  renderWithRouter(
    <ProjectConfirmDialog kind={kind} project={project} onClose={onClose} onDone={onDone} />,
  );
  return { onClose, onDone };
}

describe("ProjectConfirmDialog", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [archiveProject, restoreProject, deleteProject]) {
      command.mockReset();
    }
    archiveProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
    restoreProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
    deleteProject.mockResolvedValue({ status: "ok", data: null });
  });

  describe("archive", () => {
    it("asks to archive the project by name", async () => {
      renderDialog("archive");

      const dialog = await screen.findByRole("alertdialog", { name: "Archive “Website 2.0”?" });

      expect(dialog).toHaveAccessibleDescription(
        "It leaves the active list and can be restored later.",
      );
    });

    it("archives the project, confirms with a toast and closes", async () => {
      const { onClose, onDone } = renderDialog("archive");

      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(archiveProject).toHaveBeenCalledWith("p1");
      expect(onDone).toHaveBeenCalledTimes(1);
      expect((await screen.findAllByText("Project archived")).length).toBeGreaterThan(0);
    });

    it("does nothing when cancelled", async () => {
      const { onClose, onDone } = renderDialog("archive");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onDone).not.toHaveBeenCalled();
      expect(archiveProject).not.toHaveBeenCalled();
    });

    it("shows the translated error and stays open when the backend fails", async () => {
      archiveProject.mockResolvedValue({
        status: "error",
        error: { code: "NOT_FOUND", message: "project not found" },
      });
      const { onClose, onDone } = renderDialog("archive");

      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      expect(
        await screen.findByText("The item was not found. It may have been removed."),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("restore", () => {
    const archived = createProjectFixture({ archivedAt: "2026-11-01T00:00:00Z" });

    it("restores the project, confirms with a toast and closes", async () => {
      const { onClose } = renderDialog("restore", archived);

      expect(
        await screen.findByRole("alertdialog", { name: "Restore “Website 2.0”?" }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(restoreProject).toHaveBeenCalledWith("p1");
      expect((await screen.findAllByText("Project restored")).length).toBeGreaterThan(0);
    });
  });

  describe("delete", () => {
    it("is a danger dialog that requires typing the project name", async () => {
      renderDialog("delete");

      const confirm = await screen.findByRole("button", { name: "Delete" });

      expect(screen.getByLabelText(/Type Website 2.0 to confirm/)).toBeInTheDocument();
      expect(confirm).toBeDisabled();
    });

    it("deletes only after the exact name is typed", async () => {
      const { onClose, onDone } = renderDialog("delete");
      await userEvent.type(await screen.findByRole("textbox"), "Website 2.");
      expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "0");
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(deleteProject).toHaveBeenCalledWith("p1");
      expect(onDone).toHaveBeenCalledTimes(1);
      expect((await screen.findAllByText("Project deleted")).length).toBeGreaterThan(0);
    });

    it("never deletes when the confirmation is cancelled", async () => {
      const { onClose } = renderDialog("delete");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(deleteProject).not.toHaveBeenCalled();
    });

    it("offers to archive instead and does not delete", async () => {
      const { onClose } = renderDialog("delete");

      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(archiveProject).toHaveBeenCalledWith("p1");
      expect(deleteProject).not.toHaveBeenCalled();
    });

    it("does not offer to archive a project that is already archived", async () => {
      renderDialog("delete", createProjectFixture({ archivedAt: "2026-11-01T00:00:00Z" }));
      await screen.findByRole("alertdialog");

      expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    });

    it("explains that everything inside will be removed", async () => {
      renderDialog("delete");

      expect(
        await screen.findByText(
          /boards, tasks and attachments of this project will be removed forever/,
        ),
      ).toBeInTheDocument();
    });

    it("follows the active language", async () => {
      await i18next.changeLanguage("pt-BR");
      renderDialog("delete");

      expect(
        await screen.findByRole("alertdialog", { name: "Excluir “Website 2.0”?" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Digite Website 2.0 para confirmar/)).toBeInTheDocument();
    });
  });
});
