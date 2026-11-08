import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { i18next } from "@/i18n";

function renderDialog(props: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      title="Delete App Fintech?"
      description="24 tasks and 2 boards will be removed."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete?"
        description="Gone."
        confirmLabel="Delete"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("is an alert dialog named by the title and described by the text", () => {
    renderDialog();

    const dialog = screen.getByRole("alertdialog", { name: "Delete App Fintech?" });

    expect(dialog).toHaveAccessibleDescription("24 tasks and 2 boards will be removed.");
  });

  it("calls onConfirm when confirmed", async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel from the translated cancel button", async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel with Escape", async () => {
    const { onCancel } = renderDialog();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("starts with the cancel button focused, not the destructive action", () => {
    renderDialog({ tone: "danger" });

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("shows the danger icon only for the danger tone", () => {
    const { unmount } = render(
      <ConfirmDialog
        isOpen
        tone="danger"
        title="Delete?"
        description="Gone."
        confirmLabel="Delete"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(document.querySelector("svg")).toBeInTheDocument();
    unmount();

    renderDialog();
    expect(document.querySelector("svg")).not.toBeInTheDocument();
  });

  it("offers a secondary action and calls it", async () => {
    const onSelect = vi.fn();
    const { onConfirm } = renderDialog({ secondaryAction: { label: "Archive", onSelect } });

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("has no secondary action by default", () => {
    renderDialog();

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows a loading, non-interactive confirm button while confirming", async () => {
    const { onConfirm } = renderDialog({ isConfirming: true });

    const confirm = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(confirm);

    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe("with a required confirmation text", () => {
    it("blocks confirming until the text matches", async () => {
      const { onConfirm } = renderDialog({ tone: "danger", confirmationText: "App Fintech" });
      const confirm = screen.getByRole("button", { name: "Delete" });

      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "App Fin");
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "tech");
      expect(confirm).toBeEnabled();

      await userEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("asks to type the text in the active language", () => {
      renderDialog({ confirmationText: "App Fintech" });

      expect(screen.getByLabelText(/Type App Fintech to confirm/)).toBeInTheDocument();
    });

    it("follows the language for the prompt", async () => {
      await i18next.changeLanguage("pt-BR");
      renderDialog({ confirmationText: "App Fintech", confirmLabel: "Excluir" });

      expect(screen.getByLabelText(/Digite App Fintech para confirmar/)).toBeInTheDocument();
    });

    it("is case sensitive", async () => {
      renderDialog({ confirmationText: "App Fintech" });

      await userEvent.type(screen.getByRole("textbox"), "app fintech");

      expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    });

    it("confirms with Enter once the text matches", async () => {
      const { onConfirm } = renderDialog({ confirmationText: "Go" });

      await userEvent.type(screen.getByRole("textbox"), "Go{Enter}");

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("does not confirm with Enter while the text does not match", async () => {
      const { onConfirm } = renderDialog({ confirmationText: "Go" });

      await userEvent.type(screen.getByRole("textbox"), "G{Enter}");

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it("asks for no text when none is required", () => {
    renderDialog();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
