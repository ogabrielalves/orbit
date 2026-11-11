import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CloseIcon from "@/assets/icons/linha/fechar.svg?react";
import { IconButton } from "@/components/atoms/IconButton";
import { findTooltipText } from "@/test/tooltip";

describe("IconButton", () => {
  it("is named by its label", () => {
    render(<IconButton icon={CloseIcon} label="Close" />);

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("is a plain button by default", () => {
    render(<IconButton icon={CloseIcon} label="Close" />);

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={CloseIcon} label="Close" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={CloseIcon} label="Close" disabled onClick={onClick} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("hides the icon from assistive technology", () => {
    const { container } = render(<IconButton icon={CloseIcon} label="Close" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows its label in a tooltip on hover", async () => {
    render(<IconButton icon={CloseIcon} label="Close" />);

    await userEvent.hover(screen.getByRole("button", { name: "Close" }));

    expect(await findTooltipText()).toContain("Close");
  });

  it("shows its label in a tooltip on keyboard focus and hides it with Escape", async () => {
    render(<IconButton icon={CloseIcon} label="Close" />);

    await userEvent.tab();
    expect(await findTooltipText()).toContain("Close");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps a single accessible name and no native title", async () => {
    render(<IconButton icon={CloseIcon} label="Close" />);
    const button = screen.getByRole("button", { name: "Close" });

    await userEvent.tab();
    await screen.findByRole("tooltip");

    expect(button).not.toHaveAttribute("title");
    expect(button).toHaveAccessibleDescription("");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("shows the shortcut in the tooltip", async () => {
    render(<IconButton icon={CloseIcon} label="Close" shortcut="Esc" />);

    await userEvent.hover(screen.getByRole("button", { name: "Close" }));

    expect(await findTooltipText()).toContain("Esc");
  });

  it("supports the small and medium sizes", () => {
    const { rerender } = render(<IconButton icon={CloseIcon} label="Close" size="sm" />);
    expect(screen.getByRole("button")).toHaveClass("size-8");

    rerender(<IconButton icon={CloseIcon} label="Close" />);
    expect(screen.getByRole("button")).toHaveClass("size-9");
  });
});
