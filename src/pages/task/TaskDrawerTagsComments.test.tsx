import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Comment, commands, type Tag } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const listTags = vi.mocked(commands.listTags);
const listTaskTags = vi.mocked(commands.listTaskTags);
const createTag = vi.mocked(commands.createTag);
const assignTag = vi.mocked(commands.assignTag);
const unassignTag = vi.mocked(commands.unassignTag);
const listComments = vi.mocked(commands.listComments);
const createComment = vi.mocked(commands.createComment);
const updateComment = vi.mocked(commands.updateComment);
const deleteComment = vi.mocked(commands.deleteComment);

const task = createTaskFixture({ id: "t1", title: "Write the spec" });

function tag(id: string, name: string, color: string | null = "ember"): Tag {
  return {
    id,
    name,
    color,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    taskCount: 0,
  };
}

function comment(id: string, body: string, updatedAt = "2026-11-08T10:00:00Z"): Comment {
  return { id, taskId: "t1", body, createdAt: "2026-11-08T10:00:00Z", updatedAt };
}

async function openDrawer() {
  renderApp("/boards/b1?task=t1");
  await screen.findByRole("textbox", { name: "Title" });
}

describe("TaskDrawer tags and comments", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      getBoard,
      listBoardTasks,
      getTask,
      listTags,
      listTaskTags,
      createTag,
      assignTag,
      unassignTag,
      listComments,
      createComment,
      updateComment,
      deleteComment,
    ]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    getTask.mockResolvedValue({ status: "ok", data: task });
    listTags.mockResolvedValue({
      status: "ok",
      data: [tag("g1", "Bug"), tag("g2", "Design"), tag("g3", "Urgent")],
    });
    listTaskTags.mockResolvedValue({ status: "ok", data: [tag("g1", "Bug")] });
    listComments.mockResolvedValue({ status: "ok", data: [] });
  });

  describe("tags", () => {
    it("lists the tags of the task", async () => {
      await openDrawer();

      const list = await screen.findByRole("list", { name: "Tags of this task" });

      expect(listTaskTags).toHaveBeenCalledWith("t1");
      expect(within(list).getByText("Bug")).toBeInTheDocument();
    });

    it("says there are no tags yet", async () => {
      listTaskTags.mockResolvedValue({ status: "ok", data: [] });
      await openDrawer();

      expect(await screen.findByText("No tags yet")).toBeInTheDocument();
    });

    it("removes a tag from the task", async () => {
      unassignTag.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Remove tag Bug" }));

      expect(unassignTag).toHaveBeenCalledWith("t1", "g1");
    });

    it("offers only the tags that are not on the task yet", async () => {
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
      const available = await screen.findByRole("list", { name: "Available tags" });

      expect(
        within(available)
          .getAllByRole("button")
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Add tag Design", "Add tag Urgent"]);
      expect(screen.getByRole("textbox", { name: "Find or create a tag" })).toHaveFocus();
    });

    it("assigns an existing tag", async () => {
      assignTag.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
      await userEvent.click(await screen.findByRole("button", { name: "Add tag Design" }));

      expect(assignTag).toHaveBeenCalledWith("t1", "g2");
    });

    it("filters the available tags while typing", async () => {
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Find or create a tag" }),
        "des",
      );

      expect(screen.getByRole("button", { name: "Add tag Design" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add tag Urgent" })).not.toBeInTheDocument();
    });

    it("creates a new tag with a color and assigns it", async () => {
      createTag.mockResolvedValue({ status: "ok", data: tag("g9", "Research", "lagoon") });
      assignTag.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Find or create a tag" }),
        "  Research ",
      );
      await userEvent.click(screen.getByRole("button", { name: "Create “Research”" }));

      await waitFor(() =>
        expect(createTag).toHaveBeenCalledWith({ name: "Research", color: "orchid" }),
      );
      await waitFor(() => expect(assignTag).toHaveBeenCalledWith("t1", "g9"));
    });

    it("creates with Enter when the name is new", async () => {
      createTag.mockResolvedValue({ status: "ok", data: tag("g9", "Research") });
      assignTag.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Find or create a tag" }),
        "Research{Enter}",
      );

      await waitFor(() => expect(createTag).toHaveBeenCalledTimes(1));
    });

    it("does not offer to create a name that already exists and assigns it with Enter", async () => {
      assignTag.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Find or create a tag" }),
        "design",
      );
      expect(screen.queryByRole("button", { name: /^Create/ })).not.toBeInTheDocument();
      await userEvent.keyboard("{Enter}");

      expect(createTag).not.toHaveBeenCalled();
      await waitFor(() => expect(assignTag).toHaveBeenCalledWith("t1", "g2"));
    });

    it("limits the tag name to 40 characters", async () => {
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));

      expect(await screen.findByRole("textbox", { name: "Find or create a tag" })).toHaveAttribute(
        "maxlength",
        "40",
      );
    });

    it("closes the picker with Escape and keeps the drawer open", async () => {
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
      await screen.findByRole("textbox", { name: "Find or create a tag" });

      await userEvent.keyboard("{Escape}");

      expect(
        screen.queryByRole("textbox", { name: "Find or create a tag" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    });
  });

  describe("comments", () => {
    it("says there are no comments yet", async () => {
      await openDrawer();

      expect(await screen.findByText("No comments yet")).toBeInTheDocument();
      expect(listComments).toHaveBeenCalledWith("t1");
    });

    it("lists the comments in order and marks the edited ones", async () => {
      listComments.mockResolvedValue({
        status: "ok",
        data: [comment("m1", "First"), comment("m2", "Second", "2026-11-08T11:00:00Z")],
      });
      await openDrawer();

      const list = await screen.findByRole("list", { name: "Comments list" });
      const items = within(list).getAllByRole("listitem");

      expect(items[0]).toHaveTextContent("First");
      expect(items[0]).not.toHaveTextContent("edited");
      expect(items[1]).toHaveTextContent("Second");
      expect(items[1]).toHaveTextContent("edited");
    });

    it("keeps Comment disabled until there is text", async () => {
      await openDrawer();

      expect(await screen.findByRole("button", { name: "Comment" })).toBeDisabled();
      await userEvent.type(screen.getByRole("textbox", { name: "New comment" }), "   ");

      expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    });

    it("adds a trimmed comment and clears the field", async () => {
      createComment.mockResolvedValue({ status: "ok", data: comment("m3", "Nice") });
      await openDrawer();
      const field = await screen.findByRole("textbox", { name: "New comment" });

      await userEvent.type(field, "  Nice  ");
      await userEvent.click(screen.getByRole("button", { name: "Comment" }));

      await waitFor(() =>
        expect(createComment).toHaveBeenCalledWith({ taskId: "t1", body: "Nice" }),
      );
      await waitFor(() => expect(field).toHaveValue(""));
    });

    it("adds with Ctrl+Enter", async () => {
      createComment.mockResolvedValue({ status: "ok", data: comment("m3", "Nice") });
      await openDrawer();

      await userEvent.type(await screen.findByRole("textbox", { name: "New comment" }), "Nice");
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1));
    });

    it("limits a comment to 10000 characters", async () => {
      await openDrawer();

      expect(await screen.findByRole("textbox", { name: "New comment" })).toHaveAttribute(
        "maxlength",
        "10000",
      );
    });

    it("keeps the text when the backend refuses", async () => {
      createComment.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      await openDrawer();
      const field = await screen.findByRole("textbox", { name: "New comment" });

      await userEvent.type(field, "Keep");
      await userEvent.click(screen.getByRole("button", { name: "Comment" }));

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
      expect(field).toHaveValue("Keep");
    });

    it("edits a comment in place", async () => {
      listComments.mockResolvedValue({ status: "ok", data: [comment("m1", "First")] });
      updateComment.mockResolvedValue({ status: "ok", data: comment("m1", "First, revised") });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Comment actions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
      const field = await screen.findByRole("textbox", { name: "Edit comment" });
      expect(field).toHaveValue("First");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      await userEvent.type(field, ", revised");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateComment).toHaveBeenCalledWith("m1", "First, revised"));
      await waitFor(() =>
        expect(screen.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument(),
      );
    });

    it("cancels the edit with Escape without closing the drawer", async () => {
      listComments.mockResolvedValue({ status: "ok", data: [comment("m1", "First")] });
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Comment actions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
      await userEvent.type(
        await screen.findByRole("textbox", { name: "Edit comment" }),
        "x{Escape}",
      );

      expect(screen.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument();
      expect(updateComment).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    });

    it("asks before deleting a comment", async () => {
      listComments.mockResolvedValue({ status: "ok", data: [comment("m1", "First")] });
      deleteComment.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();

      await userEvent.click(await screen.findByRole("button", { name: "Comment actions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
      expect(deleteComment).not.toHaveBeenCalled();
      await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteComment).toHaveBeenCalledWith("m1"));
      expect(await screen.findByText("Comment deleted")).toBeInTheDocument();
    });

    it("keeps the comment when the deletion is cancelled", async () => {
      listComments.mockResolvedValue({ status: "ok", data: [comment("m1", "First")] });
      await openDrawer();
      await userEvent.click(await screen.findByRole("button", { name: "Comment actions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(deleteComment).not.toHaveBeenCalled();
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    it("shows the sections in Portuguese", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
      });
      renderApp("/boards/b1?task=t1");

      expect(await screen.findByRole("heading", { name: "Comentários" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Adicionar tag" })).toBeInTheDocument();
    });
  });
});
