import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFormModal, type ProjectFormValues } from "@/components/organisms/ProjectFormModal";
import { i18next } from "@/i18n";

const colorOptions = [
  { value: "orbit", label: "Orbit", color: "rgb(59, 79, 228)" },
  { value: "ember", label: "Ember", color: "rgb(242, 120, 58)" },
  { value: "lagoon", label: "Lagoon", color: "rgb(18, 163, 154)" },
];

const emptyValues: ProjectFormValues = {
  name: "",
  description: "",
  color: "orbit",
  status: "active",
};

function renderModal(props: Partial<ComponentProps<typeof ProjectFormModal>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ProjectFormModal
      mode="create"
      initialValues={emptyValues}
      colorOptions={colorOptions}
      isSubmitting={false}
      onSubmit={onSubmit}
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onSubmit, onOpenChange };
}

async function typeName(name: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Project name" }), name);
}

describe("ProjectFormModal", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  describe("creating", () => {
    it("is a dialog titled for a new project with the explanation", () => {
      renderModal();

      expect(screen.getByRole("dialog", { name: "New project" })).toHaveAccessibleDescription(
        "A project groups boards, tasks and notes.",
      );
    });

    it("focuses the name field when it opens", () => {
      renderModal();

      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveFocus();
    });

    it("keeps the create button disabled until the name has content", async () => {
      renderModal();
      const submit = screen.getByRole("button", { name: "Create project" });
      expect(submit).toBeDisabled();

      await typeName("   ");
      expect(submit).toBeDisabled();

      await typeName("App");
      expect(submit).toBeEnabled();
    });

    it("limits the name to 120 characters", () => {
      renderModal();

      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveAttribute(
        "maxlength",
        "120",
      );
    });

    it("marks the description as optional", () => {
      renderModal();

      expect(screen.getByText("(optional)")).toBeInTheDocument();
    });

    it("has no status field", () => {
      renderModal();

      expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    });

    it("offers the color options it was given, with the initial one selected", () => {
      renderModal();

      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(screen.getByRole("radio", { name: "Orbit" })).toBeChecked();
    });

    it("previews the name, description and chosen color", async () => {
      renderModal();
      await typeName("Podcast");
      await userEvent.type(screen.getByRole("textbox", { name: /Description/ }), "Weekly show");
      await userEvent.click(screen.getByRole("radio", { name: "Ember" }));

      const preview = screen.getByText("Preview").parentElement as HTMLElement;

      expect(preview).toHaveTextContent("Podcast");
      expect(preview).toHaveTextContent("Weekly show");
      expect(screen.getByText("P").style.color).toBe("rgb(242, 120, 58)");
    });

    it("previews a placeholder name while the field is empty", () => {
      renderModal();

      const preview = screen.getByText("Preview").parentElement as HTMLElement;

      expect(preview).toHaveTextContent("Project name");
    });

    it("sends the trimmed values to onSubmit", async () => {
      const { onSubmit } = renderModal();
      await typeName("  Podcast  ");
      await userEvent.type(screen.getByRole("textbox", { name: /Description/ }), " Weekly show ");
      await userEvent.click(screen.getByRole("radio", { name: "Lagoon" }));

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(onSubmit).toHaveBeenCalledWith({
        name: "Podcast",
        description: "Weekly show",
        color: "lagoon",
        status: "active",
      });
    });

    it("submits with Ctrl+Enter from the description field", async () => {
      const { onSubmit } = renderModal();
      await typeName("App");

      await userEvent.type(
        screen.getByRole("textbox", { name: /Description/ }),
        "{Control>}{Enter}{/Control}",
      );

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("does not submit with Ctrl+Enter while the name is blank", async () => {
      const { onSubmit } = renderModal();

      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("follows the active language", async () => {
      await i18next.changeLanguage("pt-BR");
      renderModal();

      expect(screen.getByRole("dialog", { name: "Novo projeto" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Criar projeto" })).toBeInTheDocument();
    });
  });

  describe("closing", () => {
    it("asks to close from Cancel, the close button and Escape, without submitting", async () => {
      const { onSubmit, onOpenChange } = renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      await userEvent.keyboard("{Escape}");

      expect(onOpenChange).toHaveBeenCalledTimes(3);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not close by itself after submitting, leaving that to the caller", async () => {
      const { onOpenChange } = renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("submitting", () => {
    it("shows a loading, non-repeatable button while submitting", async () => {
      const { onSubmit } = renderModal({
        initialValues: { ...emptyValues, name: "App" },
        isSubmitting: true,
      });

      const submit = screen.getByRole("button", { name: "Create project" });
      await userEvent.click(submit);

      expect(submit).toHaveAttribute("aria-busy", "true");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("stays open with the typed text when the submission fails", async () => {
      const onSubmit = vi.fn().mockRejectedValue({ code: "VALIDATION", message: "x" });
      const { onOpenChange } = renderModal({ onSubmit });
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("App");
    });

    it("can be submitted again after a failure", async () => {
      const onSubmit = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined);
      renderModal({ onSubmit });
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));
      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    });
  });

  describe("editing", () => {
    const savedValues: ProjectFormValues = {
      name: "Fintech",
      description: "Wallet app",
      color: "ember",
      status: "paused",
    };

    it("is titled for editing and starts with the saved values", () => {
      renderModal({ mode: "edit", initialValues: savedValues });

      expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("Fintech");
      expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Wallet app");
      expect(screen.getByRole("radio", { name: "Ember" })).toBeChecked();
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("paused");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    });

    it("sends the edited values, including the status", async () => {
      const { onSubmit } = renderModal({ mode: "edit", initialValues: savedValues });
      await userEvent.clear(screen.getByRole("textbox", { name: "Project name" }));
      await typeName("Fintech 2");
      await userEvent.click(screen.getByRole("radio", { name: "Lagoon" }));
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "completed");

      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSubmit).toHaveBeenCalledWith({
        name: "Fintech 2",
        description: "Wallet app",
        color: "lagoon",
        status: "completed",
      });
    });

    it("cannot save a blank name", async () => {
      renderModal({ mode: "edit", initialValues: savedValues });

      await userEvent.clear(screen.getByRole("textbox", { name: "Project name" }));

      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });
  });
});
