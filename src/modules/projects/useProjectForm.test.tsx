import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings";
import { i18next } from "@/i18n";
import { projectColorKeys } from "@/modules/projects/colors";
import { useProjectForm } from "@/modules/projects/useProjectForm";
import { createProjectFixture } from "@/test/projectFixture";

const commands = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));
vi.mock("sonner", () => ({ toast }));

function renderForm(project: Project | undefined, onSaved = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useProjectForm(project, onSaved), { wrapper });
  return { ...rendered, onSaved };
}

const values = {
  name: "Podcast",
  description: "Weekly show",
  color: "lagoon",
  status: "paused" as const,
};

describe("useProjectForm", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
    toast.success.mockReset();
    commands.listProjects.mockResolvedValue({ status: "ok", data: [] });
  });

  describe("initial values", () => {
    it("starts empty and active with the default color when creating", () => {
      const { result } = renderForm(undefined);

      expect(result.current.mode).toBe("create");
      expect(result.current.initialValues).toEqual({
        name: "",
        description: "",
        color: "orbit",
        status: "active",
      });
    });

    it("starts from the project when editing", () => {
      const project = createProjectFixture({
        name: "Fintech",
        description: "Wallet",
        color: "ember",
        status: "paused",
      });
      const { result } = renderForm(project);

      expect(result.current.mode).toBe("edit");
      expect(result.current.initialValues).toEqual({
        name: "Fintech",
        description: "Wallet",
        color: "ember",
        status: "paused",
      });
    });

    it.each([
      ["a color saved in an older format", "#123456"],
      ["no color", null],
      ["an unknown color", "magenta"],
    ])("falls back to the default color for %s", (_label, color) => {
      const { result } = renderForm(createProjectFixture({ color }));

      expect(result.current.initialValues.color).toBe("orbit");
    });
  });

  describe("color options", () => {
    it("offers every palette color with a translated name and its design token", () => {
      const { result } = renderForm(undefined);

      expect(result.current.colorOptions).toHaveLength(projectColorKeys.length);
      expect(result.current.colorOptions[2]).toEqual({
        value: "lagoon",
        label: "Lagoon",
        color: "var(--color-project-lagoon)",
      });
    });

    it("follows the active language", async () => {
      await i18next.changeLanguage("pt-BR");
      const { result } = renderForm(undefined);

      expect(result.current.colorOptions[2]?.label).toBe("Lagoa");
    });
  });

  describe("creating", () => {
    it("creates the project with the name, description and color", async () => {
      const created = createProjectFixture({ id: "new" });
      commands.createProject.mockResolvedValue({ status: "ok", data: created });
      const { result, onSaved } = renderForm(undefined);

      await act(() => result.current.submit(values));

      expect(commands.createProject).toHaveBeenCalledWith({
        name: "Podcast",
        description: "Weekly show",
        color: "lagoon",
      });
      expect(onSaved).toHaveBeenCalledWith(created);
    });

    it("does not send a status, since a new project is always active", async () => {
      commands.createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { result } = renderForm(undefined);

      await act(() => result.current.submit(values));

      expect(commands.createProject.mock.calls[0]?.[0]).not.toHaveProperty("status");
    });

    it("confirms with a translated toast", async () => {
      commands.createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { result } = renderForm(undefined);

      await act(() => result.current.submit(values));

      expect(toast.success).toHaveBeenCalledWith("Project created");
    });

    it("reports the toast in the active language", async () => {
      await i18next.changeLanguage("pt-BR");
      commands.createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { result } = renderForm(undefined);

      await act(() => result.current.submit(values));

      expect(toast.success).toHaveBeenCalledWith("Projeto criado");
    });

    it("refreshes the project lists afterwards", async () => {
      commands.createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { result } = renderForm(undefined);

      await act(() => result.current.submit(values));

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("editing", () => {
    it("updates the project by id with every field, including the status", async () => {
      const project = createProjectFixture({ id: "p7" });
      commands.updateProject.mockResolvedValue({ status: "ok", data: project });
      const { result, onSaved } = renderForm(project);

      await act(() => result.current.submit(values));

      expect(commands.updateProject).toHaveBeenCalledWith("p7", values);
      expect(commands.createProject).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith(project);
    });

    it("confirms with a translated toast", async () => {
      const project = createProjectFixture();
      commands.updateProject.mockResolvedValue({ status: "ok", data: project });
      const { result } = renderForm(project);

      await act(() => result.current.submit(values));

      expect(toast.success).toHaveBeenCalledWith("Project updated");
    });
  });

  describe("failures", () => {
    it("rejects, without a success toast or onSaved, so the form can stay open", async () => {
      const payload = { code: "VALIDATION", message: "project name cannot be empty" };
      commands.createProject.mockResolvedValue({ status: "error", error: payload });
      const { result, onSaved } = renderForm(undefined);

      await expect(act(() => result.current.submit(values))).rejects.toBe(payload);

      expect(toast.success).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("rejects an update the same way", async () => {
      const payload = { code: "NOT_FOUND", message: "project not found" };
      commands.updateProject.mockResolvedValue({ status: "error", error: payload });
      const { result, onSaved } = renderForm(createProjectFixture());

      await expect(act(() => result.current.submit(values))).rejects.toBe(payload);

      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  it("reports when a save is in flight", async () => {
    commands.createProject.mockReturnValue(new Promise(() => undefined));
    const { result } = renderForm(undefined);

    act(() => {
      void result.current.submit(values);
    });

    await vi.waitFor(() => expect(result.current.isSubmitting).toBe(true));
  });
});
