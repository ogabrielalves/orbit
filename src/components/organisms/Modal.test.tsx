import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/organisms/Modal";

function renderModal(props: Partial<ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <Modal isOpen onClose={onClose} title="New project" closeLabel="Close" {...props}>
      <p>Body content</p>
    </Modal>,
  );
  return { onClose };
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(
      <Modal isOpen={false} onClose={() => undefined} title="New project" closeLabel="Close">
        <p>Body content</p>
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders an accessible dialog named by its title", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("describes the dialog when a description is given", () => {
    renderModal({ description: "A project groups boards and tasks." });

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "A project groups boards and tasks.",
    );
  });

  it("renders the footer when provided", () => {
    renderModal({ footer: <button type="button">Create</button> });

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("renders no footer by default", () => {
    renderModal();

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("closes from the close button", async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape", async () => {
    const { onClose } = renderModal();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog", () => {
    renderModal();

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("focuses the element given as the initial focus", () => {
    const initialFocusRef = createRef<HTMLInputElement>();
    render(
      <Modal
        isOpen
        onClose={() => undefined}
        title="A"
        closeLabel="Close"
        initialFocusRef={initialFocusRef}
      >
        <input aria-label="Name" ref={initialFocusRef} />
      </Modal>,
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });

  it("falls back to the default focus when the initial element is missing", () => {
    const initialFocusRef = createRef<HTMLInputElement>();
    render(
      <Modal
        isOpen
        onClose={() => undefined}
        title="A"
        closeLabel="Close"
        initialFocusRef={initialFocusRef}
      >
        <p>x</p>
      </Modal>,
    );

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("supports the small and large sizes", () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => undefined} title="A" closeLabel="Close" size="sm">
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("max-w-110");

    rerender(
      <Modal isOpen onClose={() => undefined} title="A" closeLabel="Close" size="lg">
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("max-w-220");
  });
});
