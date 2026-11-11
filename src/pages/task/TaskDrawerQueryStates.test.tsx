import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const task = createTaskFixture({ id: "t1", title: "Write the spec" });
const failure = { status: "error", error: { code: "IO", message: "x" } } as const;
const never = () => new Promise<never>(() => undefined);

const sections = [
  {
    name: "Attachments",
    command: () => vi.mocked(commands.listAttachments),
    error: "Could not load the attachments",
    empty: null,
  },
  {
    name: "Comments",
    command: () => vi.mocked(commands.listComments),
    error: "Could not load the comments",
    empty: "No comments yet",
  },
  {
    name: "Subtasks",
    command: () => vi.mocked(commands.listSubtasks),
    error: "Could not load the subtasks",
    empty: null,
  },
  {
    name: "Checklist",
    command: () => vi.mocked(commands.listChecklistItems),
    error: "Could not load the checklist",
    empty: null,
  },
  {
    name: "Tags",
    command: () => vi.mocked(commands.listTaskTags),
    error: "Could not load the tags",
    empty: "No tags yet",
  },
] as const;

async function openDrawer() {
  renderApp("/boards/b1?task=t1");
  await screen.findByRole("textbox", { name: "Title" });
}

describe("task drawer sections load states", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    vi.mocked(commands.getBoard).mockResolvedValue({
      status: "ok",
      data: createBoardDetailsFixture(),
    });
    vi.mocked(commands.listBoardTasks).mockResolvedValue({ status: "ok", data: [task] });
    vi.mocked(commands.getTask).mockResolvedValue({ status: "ok", data: task });
    for (const section of sections) {
      section.command().mockReset();
      section.command().mockResolvedValue({ status: "ok", data: [] } as never);
    }
    vi.mocked(commands.listTags).mockResolvedValue({ status: "ok", data: [] });
  });

  describe.each(sections)("$name", ({ name, command, error, empty }) => {
    it("shows a loading state while the data loads", async () => {
      command().mockImplementation(never);
      await openDrawer();

      const section = await screen.findByRole("region", { name });

      const loading = within(section).getByText("Loading…").closest("[aria-busy]");
      expect(loading).toHaveAttribute("aria-busy", "true");
      if (empty !== null) {
        expect(within(section).queryByText(empty)).not.toBeInTheDocument();
      }
    });

    it("explains the failure and loads again on retry", async () => {
      command().mockResolvedValue(failure as never);
      await openDrawer();
      const section = await screen.findByRole("region", { name });

      expect(await within(section).findByText(error)).toBeInTheDocument();
      if (empty !== null) {
        expect(within(section).queryByText(empty)).not.toBeInTheDocument();
      }

      command().mockResolvedValue({ status: "ok", data: [] } as never);
      await userEvent.click(within(section).getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(screen.queryByText(error)).not.toBeInTheDocument());
      expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
      expect(command()).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the empty messages once the data arrives", async () => {
    await openDrawer();

    expect(await screen.findByText("No comments yet")).toBeInTheDocument();
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });

  it("keeps the other sections working when one fails", async () => {
    vi.mocked(commands.listComments).mockResolvedValue(failure as never);
    await openDrawer();

    expect(await screen.findByText("Could not load the comments")).toBeInTheDocument();
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the tags")).not.toBeInTheDocument();
  });

  it("explains a tag list failure and retries both tag queries", async () => {
    vi.mocked(commands.listTags).mockResolvedValue(failure as never);
    await openDrawer();
    const section = await screen.findByRole("region", { name: "Tags" });

    expect(await within(section).findByText("Could not load the tags")).toBeInTheDocument();
    expect(within(section).queryByText("No tags yet")).not.toBeInTheDocument();

    vi.mocked(commands.listTags).mockResolvedValue({ status: "ok", data: [] });
    await userEvent.click(within(section).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByText("No tags yet")).toBeInTheDocument();
  });

  it("translates the failure to pt-BR", async () => {
    await i18next.changeLanguage("pt-BR");
    vi.mocked(commands.getSettings).mockResolvedValue({
      status: "ok",
      data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
    });
    vi.mocked(commands.listComments).mockResolvedValue(failure as never);
    renderApp("/boards/b1?task=t1");

    expect(await screen.findByText("Não foi possível carregar os comentários")).toBeInTheDocument();
  });
});
