import type { DndContextProps } from "@dnd-kit/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckList } from "@/components/organisms/CheckList";
import { i18next } from "@/i18n";

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

const entries = [
  { id: "a", text: "Write the draft", isDone: true },
  { id: "b", text: "Review it", isDone: false },
  { id: "c", text: "Publish", isDone: false },
];

function renderList(props: Partial<ComponentProps<typeof CheckList>> = {}) {
  const handlers = {
    onAdd: vi.fn(),
    onToggle: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
  };
  render(
    <CheckList
      kind="checklist"
      entries={entries}
      maxLength={500}
      isAdding={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

async function openRowMenu(text: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: `Actions for item ${text}` }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

describe("CheckList", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.props = null;
  });

  describe("showing", () => {
    it("lists the entries with their state and the progress", () => {
      renderList();

      const list = screen.getByRole("list", { name: "Checklist items" });
      const boxes = within(list).getAllByRole("checkbox");

      expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false, false]);
      expect(screen.getByText("1/3 done")).toBeInTheDocument();
      expect(screen.getByText("Write the draft")).toHaveClass("line-through");
      expect(screen.getByText("Review it")).not.toHaveClass("line-through");
    });

    it("shows only the title and the add field when empty", () => {
      renderList({ entries: [] });

      expect(screen.getByRole("heading", { name: "Checklist" })).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText(/done/)).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "New checklist item" })).toBeInTheDocument();
    });

    it("uses the subtask wording for subtasks", () => {
      renderList({ kind: "subtasks" });

      expect(screen.getByRole("heading", { name: "Subtasks" })).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Subtask list" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "New subtask" })).toBeInTheDocument();
    });

    it("speaks Portuguese", async () => {
      await i18next.changeLanguage("pt-BR");
      renderList();

      expect(screen.getByText("1/3 concluídos")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    });
  });

  describe("toggling", () => {
    it("reports the new state of the entry", async () => {
      const { onToggle } = renderList();

      await userEvent.click(screen.getByRole("checkbox", { name: "Review it" }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Write the draft" }));

      expect(onToggle).toHaveBeenNthCalledWith(1, "b", true);
      expect(onToggle).toHaveBeenNthCalledWith(2, "a", false);
    });
  });

  describe("adding", () => {
    it("keeps Add disabled for a blank text", async () => {
      renderList();

      expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
      await userEvent.type(screen.getByRole("textbox", { name: "New checklist item" }), "   ");

      expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    });

    it("adds the trimmed text with Enter, clears the field and keeps the focus", async () => {
      const { onAdd } = renderList();
      const field = screen.getByRole("textbox", { name: "New checklist item" });

      await userEvent.type(field, "  Celebrate {Enter}");

      expect(onAdd).toHaveBeenCalledWith("Celebrate");
      expect(field).toHaveValue("");
      expect(field).toHaveFocus();
    });

    it("adds with the button", async () => {
      const { onAdd } = renderList();

      await userEvent.type(screen.getByRole("textbox", { name: "New checklist item" }), "Ship");
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(onAdd).toHaveBeenCalledWith("Ship");
    });

    it("limits the text", () => {
      renderList({ maxLength: 200 });

      expect(screen.getByRole("textbox", { name: "New checklist item" })).toHaveAttribute(
        "maxlength",
        "200",
      );
    });

    it("does not add again while an add is in flight", async () => {
      const { onAdd } = renderList({ isAdding: true });

      await userEvent.type(
        screen.getByRole("textbox", { name: "New checklist item" }),
        "Ship{Enter}",
      );

      expect(onAdd).not.toHaveBeenCalled();
    });
  });

  describe("renaming", () => {
    it("edits the text in place and saves with Enter", async () => {
      const { onRename } = renderList();

      await openRowMenu("Review it", "Rename");
      const field = await screen.findByRole("textbox", { name: "Item text" });
      expect(field).toHaveValue("Review it");
      expect(field).toHaveFocus();
      await userEvent.clear(field);
      await userEvent.type(field, "Review twice{Enter}");

      expect(onRename).toHaveBeenCalledWith("b", "Review twice");
      expect(screen.queryByRole("textbox", { name: "Item text" })).not.toBeInTheDocument();
    });

    it("cancels with Escape and does not report anything", async () => {
      const { onRename } = renderList();

      await openRowMenu("Review it", "Rename");
      await userEvent.type(await screen.findByRole("textbox", { name: "Item text" }), "x{Escape}");

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.getByText("Review it")).toBeInTheDocument();
    });

    it("ignores a blank or unchanged text", async () => {
      const { onRename } = renderList();

      await openRowMenu("Review it", "Rename");
      await userEvent.type(await screen.findByRole("textbox", { name: "Item text" }), "{Enter}");
      await openRowMenu("Review it", "Rename");
      await userEvent.clear(await screen.findByRole("textbox", { name: "Item text" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Item text" }), "   {Enter}");

      expect(onRename).not.toHaveBeenCalled();
    });

    it("gives the text back when the field loses focus", async () => {
      const { onRename } = renderList();

      await openRowMenu("Review it", "Rename");
      await userEvent.type(await screen.findByRole("textbox", { name: "Item text" }), "x");
      await userEvent.click(document.body);

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.getByText("Review it")).toBeInTheDocument();
    });
  });

  describe("deleting and reordering", () => {
    it("deletes from the row menu", async () => {
      const { onDelete } = renderList();

      await openRowMenu("Publish", "Delete");

      expect(onDelete).toHaveBeenCalledWith("c");
    });

    it("gives every row a named handle", () => {
      renderList();

      expect(screen.getByRole("button", { name: "Reorder item Review it" })).toBeInTheDocument();
    });

    it("reports a drop as a move after the anchor", async () => {
      const { onMove } = renderList();

      await act(async () => {
        dnd.props?.onDragEnd?.({ active: { id: "a" }, over: { id: "c" } } as never);
      });

      expect(onMove).toHaveBeenCalledWith({ id: "a", afterId: "c" });
    });

    it("reports a move to the top with a null anchor", async () => {
      const { onMove } = renderList();

      await act(async () => {
        dnd.props?.onDragEnd?.({ active: { id: "c" }, over: { id: "a" } } as never);
      });

      expect(onMove).toHaveBeenCalledWith({ id: "c", afterId: null });
    });

    it("ignores drops outside the list or on the same row", async () => {
      const { onMove } = renderList();

      await act(async () => {
        dnd.props?.onDragEnd?.({ active: { id: "a" }, over: null } as never);
        dnd.props?.onDragEnd?.({ active: { id: "a" }, over: { id: "a" } } as never);
      });

      expect(onMove).not.toHaveBeenCalled();
    });
  });
});
