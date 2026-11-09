import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardFormModal, type BoardTemplateOption } from "@/components/organisms/BoardFormModal";
import { i18next } from "@/i18n";

const templates: BoardTemplateOption[] = [
  {
    id: "sprint",
    label: "Sprint",
    description: "Backlog to done.",
    columns: [
      { name: "Backlog", kind: "todo" },
      { name: "In progress", kind: "in_progress" },
      { name: "Done", kind: "done" },
    ],
  },
  { id: "blank", label: "Blank", description: "No columns.", columns: [] },
];

function renderModal(props: Partial<ComponentProps<typeof BoardFormModal>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <BoardFormModal
      templates={templates}
      defaultTemplateId="sprint"
      isSubmitting={false}
      onSubmit={onSubmit}
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onSubmit, onOpenChange };
}

async function typeName(name: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Board name" }), name);
}

describe("BoardFormModal", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("is a dialog titled for a new board with the name field focused", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "New board" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Board name" })).toHaveFocus();
  });

  it("starts on the default template and previews its columns", () => {
    renderModal();

    expect(screen.getByRole("radio", { name: /Sprint/ })).toBeChecked();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Backlog",
      "In progress",
      "Done",
    ]);
  });

  it("cannot be submitted with a blank name", async () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
    await typeName("   ");

    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
  });

  it("submits the trimmed name with the columns of the selected template", async () => {
    const { onSubmit } = renderModal();

    await typeName("  Sprint 12 ");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Sprint 12",
      columns: [
        { name: "Backlog", kind: "todo" },
        { name: "In progress", kind: "in_progress" },
        { name: "Done", kind: "done" },
      ],
    });
  });

  it("switches the preview and the submitted columns with the template", async () => {
    const { onSubmit } = renderModal();

    await userEvent.click(screen.getByRole("radio", { name: /Blank/ }));

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No columns. You can add them later.")).toBeInTheDocument();

    await typeName("Notes");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Notes", columns: [] });
  });

  it("submits with the keyboard shortcut", async () => {
    const { onSubmit } = renderModal();

    await typeName("Quick");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("stays open and keeps what was typed when the submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    const { onOpenChange } = renderModal({ onSubmit });

    await typeName("Keep me");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Board name" })).toHaveValue("Keep me");
  });

  it("asks to close from Cancel", async () => {
    const { onOpenChange, onSubmit } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a loading submit button while submitting", () => {
    renderModal({ isSubmitting: true });

    expect(screen.getByRole("button", { name: /Create board/ })).toBeDisabled();
  });
});
