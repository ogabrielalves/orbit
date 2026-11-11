import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BacklogItem, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const listBacklog = vi.mocked(commands.listBacklog);
const getProject = vi.mocked(commands.getProject);
const getBoard = vi.mocked(commands.getBoard);
const sendTaskToBoard = vi.mocked(commands.sendTaskToBoard);
const failure = { status: "error", error: { code: "IO", message: "x" } } as const;

const backlogItem: BacklogItem = {
  task: createTaskFixture({ id: "t1", title: "First", projectId: "p1", boardId: null }),
  projectName: "ORBIT",
  tags: [],
  subtaskCount: 0,
  subtasksDone: 0,
  checklistCount: 0,
  checklistDone: 0,
};

const details = {
  project: createProjectFixture({ id: "p1" }),
  boards: [{ id: "b1", name: "Sprint 14", createdAt: "2026-11-01T10:00:00Z", taskCount: 0 }],
  taskCount: 1,
  backlogTaskCount: 1,
};

async function openModal() {
  renderApp("/backlog");
  await userEvent.click(await screen.findByRole("button", { name: "Send First to a board" }));
  return screen.findByRole("dialog", { name: "Send “First” to a board" });
}

describe("Backlog send to board load failures", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [listBacklog, getProject, getBoard, sendTaskToBoard]) {
      command.mockReset();
    }
    listBacklog.mockResolvedValue({ status: "ok", data: [backlogItem] });
    getProject.mockResolvedValue({ status: "ok", data: details });
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
  });

  it("explains a project failure instead of showing an empty form", async () => {
    getProject.mockResolvedValue(failure as never);
    const dialog = await openModal();

    expect(await within(dialog).findByText("Could not load the boards")).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/has no boards yet/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Loading…")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("loads the boards again on retry", async () => {
    getProject.mockResolvedValue(failure as never);
    const dialog = await openModal();
    await within(dialog).findByText("Could not load the boards");

    getProject.mockResolvedValue({ status: "ok", data: details });
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));

    expect(await within(dialog).findByRole("option", { name: "To do" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Could not load the boards")).not.toBeInTheDocument();
  });

  it("explains a board failure and retries the board", async () => {
    getBoard.mockResolvedValue(failure as never);
    const dialog = await openModal();

    expect(await within(dialog).findByText("Could not load the boards")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();

    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(2));
    expect(await within(dialog).findByRole("option", { name: "To do" })).toBeInTheDocument();
  });

  it("translates the failure to pt-BR", async () => {
    await i18next.changeLanguage("pt-BR");
    vi.mocked(commands.getSettings).mockResolvedValue({
      status: "ok",
      data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
    });
    getProject.mockResolvedValue(failure as never);
    renderApp("/backlog");
    await userEvent.click(
      await screen.findByRole("button", { name: /^Enviar .* para um quadro$/ }),
    );

    expect(await screen.findByText("Não foi possível carregar os quadros")).toBeInTheDocument();
  });
});
