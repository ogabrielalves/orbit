import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "@/components/atoms/Textarea";

describe("Textarea", () => {
  it("renders a multiline text box with its accessible name", () => {
    render(<Textarea aria-label="Description" />);

    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
  });

  it("calls onChange while typing", async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Description" onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "abc");

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("starts with three rows and accepts a custom amount", () => {
    const { rerender } = render(<Textarea aria-label="Description" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "3");

    rerender(<Textarea aria-label="Description" rows={6} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "6");
  });

  it("marks the field as invalid when it has an error", () => {
    render(<Textarea aria-label="Description" hasError />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid by default", () => {
    render(<Textarea aria-label="Description" />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  });

  it("does not accept typing when disabled", async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Description" disabled onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "abc");

    expect(onChange).not.toHaveBeenCalled();
  });
});
