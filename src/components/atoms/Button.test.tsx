import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PlusIcon from "@/assets/icons/linha/backlog.svg?react";
import { Button } from "@/components/atoms/Button";

describe("Button", () => {
  it("renders its label and is a plain button by default", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a spinner and ignores clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Saving…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving…" });

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not marked busy when idle", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "false");
  });

  it("renders the icon before the label", () => {
    const { container } = render(<Button icon={PlusIcon}>New</Button>);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("replaces the icon with the spinner while loading", () => {
    const { container } = render(
      <Button icon={PlusIcon} isLoading>
        New
      </Button>,
    );

    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("can be activated with the keyboard", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("submits a form when type is submit", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Send</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
