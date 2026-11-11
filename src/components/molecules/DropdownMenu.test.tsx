import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TrashIcon from "@/assets/icons/linha/lixeira.svg?react";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";

function renderMenu() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  render(
    <DropdownMenu
      trigger={<button type="button">Project actions</button>}
      sections={[
        [
          { id: "edit", label: "Edit project", onSelect: onEdit, shortcut: "F2" },
          { id: "duplicate", label: "Duplicate", onSelect: vi.fn(), isDisabled: true },
        ],
        [{ id: "delete", label: "Delete…", onSelect: onDelete, isDanger: true, icon: TrashIcon }],
      ]}
    />,
  );

  return { onEdit, onDelete };
}

describe("DropdownMenu", () => {
  it("keeps the menu closed until the trigger is used", () => {
    renderMenu();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a menu named by its trigger with every item", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));

    expect(await screen.findByRole("menu", { name: "Project actions" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("shows the shortcut of an item", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));

    expect(await screen.findByText("F2")).toBeInTheDocument();
  });

  it("marks the highlighted item with a ring and a tint, not only a faint background", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));

    const item = await screen.findByRole("menuitem", { name: /Edit project/ });

    expect(item).toHaveClass("data-highlighted:ring-2");
    expect(item).toHaveClass("data-highlighted:ring-primary");
    expect(item).toHaveClass("data-highlighted:bg-primary-soft");
    expect(item).not.toHaveClass("data-highlighted:bg-surface-muted");
  });

  it("calls onSelect and closes when an item is chosen", async () => {
    const { onEdit } = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Edit project/ }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks a disabled item as disabled", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));

    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("styles the dangerous item with the danger color", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));

    expect(await screen.findByRole("menuitem", { name: "Delete…" })).toHaveClass("text-danger-fg");
  });

  it("separates the sections", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));
    await screen.findByRole("menu");

    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("closes with Escape without selecting anything", async () => {
    const { onEdit, onDelete } = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Project actions" }));
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("opens with the keyboard and selects the first item with Enter", async () => {
    const { onEdit } = renderMenu();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{Enter}");

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("skips disabled items when moving with the arrow keys", async () => {
    const { onEdit, onDelete } = renderMenu();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("can be opened and observed from the outside", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <DropdownMenu
        isOpen={false}
        onOpenChange={onOpenChange}
        trigger={<button type="button">Project actions</button>}
        sections={[[{ id: "edit", label: "Edit project", onSelect: vi.fn() }]]}
      />,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    rerender(
      <DropdownMenu
        isOpen
        onOpenChange={onOpenChange}
        trigger={<button type="button">Project actions</button>}
        sections={[[{ id: "edit", label: "Edit project", onSelect: vi.fn() }]]}
      />,
    );
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
