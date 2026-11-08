import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { ProjectFormModal } from "@/pages/projects/ProjectFormModal";
import { createProjectFixture } from "@/test/projectFixture";
import { renderWithRouter } from "@/test/renderWithRouter";

const createProject = vi.mocked(commands.createProject);
const updateProject = vi.mocked(commands.updateProject);

function renderModal(props: Partial<React.ComponentProps<typeof ProjectFormModal>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithRouter(<ProjectFormModal onClose={onClose} onSaved={onSaved} {...props} />);
  return { onClose, onSaved };
}

async function typeName(name: string) {
  await userEvent.type(await screen.findByRole("textbox", { name: "Project name" }), name);
}

describe("ProjectFormModal", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    createProject.mockReset();
    updateProject.mockReset();
    createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
    updateProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
  });

  describe("creating", () => {
    it("is a dialog titled for a new project with the explanation", async () => {
      renderModal();

      const dialog = await screen.findByRole("dialog", { name: "New project" });

      expect(dialog).toHaveAccessibleDescription("A project groups boards, tasks and notes.");
    });

    it("focuses the name field when it opens", async () => {
      renderModal();

      expect(await screen.findByRole("textbox", { name: "Project name" })).toHaveFocus();
    });

    it("keeps the create button disabled until the name has content", async () => {
      renderModal();
      const submit = await screen.findByRole("button", { name: "Create project" });
      expect(submit).toBeDisabled();

      await typeName("   ");
      expect(submit).toBeDisabled();

      await typeName("App");
      expect(submit).toBeEnabled();
    });

    it("limits the name to 120 characters", async () => {
      renderModal();

      expect(await screen.findByRole("textbox", { name: "Project name" })).toHaveAttribute(
        "maxlength",
        "120",
      );
    });

    it("marks the description as optional", async () => {
      renderModal();

      expect(await screen.findByText("(optional)")).toBeInTheDocument();
    });

    it("previews the name, the description and the chosen color", async () => {
      renderModal();
      await typeName("Podcast");
      await userEvent.type(screen.getByRole("textbox", { name: /Description/ }), "Weekly show");
      await userEvent.click(screen.getByRole("radio", { name: "Orchid" }));

      const preview = screen.getByText("Preview").parentElement as HTMLElement;

      expect(preview).toHaveTextContent("Podcast");
      expect(preview).toHaveTextContent("Weekly show");
      expect(screen.getByText("P").style.color).toBe("var(--color-project-orchid)");
    });

    it("starts with the default color selected", async () => {
      renderModal();

      expect(await screen.findByRole("radio", { name: "Orbit" })).toBeChecked();
    });

    it("creates the project with trimmed text and the palette color key", async () => {
      const { onClose, onSaved } = renderModal();
      await typeName("  Podcast  ");
      await userEvent.type(screen.getByRole("textbox", { name: /Description/ }), " Weekly show ");
      await userEvent.click(screen.getByRole("radio", { name: "Lagoon" }));

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(createProject).toHaveBeenCalledWith({
        name: "Podcast",
        description: "Weekly show",
        color: "lagoon",
      });
      expect(onSaved).toHaveBeenCalledWith(createProjectFixture());
    });

    it("confirms with a translated success toast", async () => {
      renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect((await screen.findAllByText("Project created")).length).toBeGreaterThan(0);
    });

    it("submits with Ctrl+Enter from the description field", async () => {
      const { onClose } = renderModal();
      await typeName("App");

      await userEvent.type(
        screen.getByRole("textbox", { name: /Description/ }),
        "{Control>}{Enter}{/Control}",
      );

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    it("does not submit with Ctrl+Enter while the name is blank", async () => {
      renderModal();
      await screen.findByRole("dialog");

      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(createProject).not.toHaveBeenCalled();
    });

    it("shows the translated error and stays open when the backend rejects", async () => {
      createProject.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "project name cannot be empty" },
      });
      const { onClose } = renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(await screen.findByText("The information provided is not valid.")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("App");
    });

    it("shows a loading, non-repeatable button while saving", async () => {
      createProject.mockReturnValue(new Promise(() => undefined));
      renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Create project" }));
      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(screen.getByRole("button", { name: "Create project" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    it("closes without saving from Cancel and from Escape", async () => {
      const { onClose } = renderModal();
      await typeName("App");

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(2);
      expect(createProject).not.toHaveBeenCalled();
    });

    it("has no status field", async () => {
      renderModal();
      await screen.findByRole("dialog");

      expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    });

    it("follows the active language", async () => {
      await i18next.changeLanguage("pt-BR");
      renderModal();

      expect(await screen.findByRole("dialog", { name: "Novo projeto" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Criar projeto" })).toBeInTheDocument();
    });
  });

  describe("editing", () => {
    const project = createProjectFixture({
      id: "p7",
      name: "Fintech",
      description: "Wallet app",
      color: "ember",
      status: "paused",
    });

    it("is titled for editing and starts with the saved values", async () => {
      renderModal({ project });

      expect(await screen.findByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("Fintech");
      expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Wallet app");
      expect(screen.getByRole("radio", { name: "Ember" })).toBeChecked();
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("paused");
    });

    it("saves the edited fields by project id", async () => {
      const { onClose, onSaved } = renderModal({ project });
      await userEvent.clear(await screen.findByRole("textbox", { name: "Project name" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Project name" }), "Fintech 2");
      await userEvent.click(screen.getByRole("radio", { name: "Moss" }));
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "completed");

      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(updateProject).toHaveBeenCalledWith("p7", {
        name: "Fintech 2",
        description: "Wallet app",
        color: "moss",
        status: "completed",
      });
      expect(createProject).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("confirms with a translated success toast", async () => {
      renderModal({ project });

      await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));

      expect((await screen.findAllByText("Project updated")).length).toBeGreaterThan(0);
    });

    it("cannot save a blank name", async () => {
      renderModal({ project });
      await userEvent.clear(await screen.findByRole("textbox", { name: "Project name" }));

      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("falls back to the default color for a color saved in an older format", async () => {
      renderModal({ project: createProjectFixture({ color: "#123456" }) });

      expect(await screen.findByRole("radio", { name: "Orbit" })).toBeChecked();
    });

    it("falls back to the default color when the project has none", async () => {
      renderModal({ project: createProjectFixture({ color: null }) });

      expect(await screen.findByRole("radio", { name: "Orbit" })).toBeChecked();
    });
  });
});
