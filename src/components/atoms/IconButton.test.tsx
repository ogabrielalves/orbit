import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CloseIcon from "@/assets/icons/linha/fechar.svg?react";
import { IconButton } from "@/components/atoms/IconButton";

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

  it("supports the small and medium sizes", () => {
    const { rerender } = render(<IconButton icon={CloseIcon} label="Close" size="sm" />);
    expect(screen.getByRole("button")).toHaveClass("size-8");

    rerender(<IconButton icon={CloseIcon} label="Close" />);
    expect(screen.getByRole("button")).toHaveClass("size-9");
  });
});
