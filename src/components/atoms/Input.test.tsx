import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SearchIcon from "@/assets/icons/linha/busca.svg?react";
import { Input } from "@/components/atoms/Input";

describe("Input", () => {
  it("renders a text box with its accessible name", () => {
    render(<Input aria-label="Project name" />);

    expect(screen.getByRole("textbox", { name: "Project name" })).toBeInTheDocument();
  });

  it("calls onChange while typing", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Project name" onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "abc");

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("shows the placeholder", () => {
    render(<Input aria-label="Search" placeholder="Search projects…" />);

    expect(screen.getByPlaceholderText("Search projects…")).toBeInTheDocument();
  });

  it("renders the leading icon when provided", () => {
    const { container } = render(<Input aria-label="Search" icon={SearchIcon} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no icon by default", () => {
    const { container } = render(<Input aria-label="Search" />);

    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("marks the field as invalid when it has an error", () => {
    render(<Input aria-label="Name" hasError />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid by default", () => {
    render(<Input aria-label="Name" />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  });

  it("does not accept typing when disabled", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" disabled onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "abc");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the controlled value", () => {
    render(<Input aria-label="Name" value="Website" onChange={() => undefined} />);

    expect(screen.getByRole("textbox")).toHaveValue("Website");
  });
});
